import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import type { AutomationPlan, PlanTextItem, PlanTextLibrary } from '@/planner/types/plan'

export type TextSourceMode = 'manual' | 'library' | 'json_label' | 'json_queue'

export type ResolvedTypeText = {
  text: string
  meta?: string
  hasMore?: boolean
  index?: number
  total?: number
}

const CURSOR_KEY = 'planner-text-queue-cursors'

type CursorMap = Record<string, number>

function cursorId(workflowId: string, nodeId: string, queueKey: string): string {
  return `${workflowId}:${nodeId}:${queueKey}`
}

/** Parse numbered / plain line lists from the Planner text library editor */
export function parseNumberedTextList(raw: string): Array<{ title: string; text: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+\s*[.)\-:]\s*(.+)$/)
      const title = (match?.[1] ?? line).replace(/,\s*$/, '').trim()
      return { title, text: title }
    })
    .filter((item) => item.title.length > 0)
}

export function libraryToEditableText(library: PlanTextLibrary): string {
  return library.items.map((item, index) => `${index + 1}. ${item.title}`).join('\n')
}

export async function getQueueCursor(
  workflowId: string,
  nodeId: string,
  queueKey: string,
): Promise<number> {
  const map = await storageGet<CursorMap>(CURSOR_KEY, {})
  return map[cursorId(workflowId, nodeId, queueKey)] ?? 0
}

export async function setQueueCursor(
  workflowId: string,
  nodeId: string,
  queueKey: string,
  index: number,
): Promise<void> {
  const map = await storageGet<CursorMap>(CURSOR_KEY, {})
  map[cursorId(workflowId, nodeId, queueKey)] = index
  await storageSet(CURSOR_KEY, map)
}

export async function resetQueueCursor(
  workflowId: string,
  nodeId: string,
  queueKey: string,
): Promise<void> {
  await setQueueCursor(workflowId, nodeId, queueKey, 0)
}

/** Clear all TypeText queue cursors for a workflow (called on each Run). */
export async function resetWorkflowQueueCursors(workflowId: string): Promise<void> {
  const map = await storageGet<CursorMap>(CURSOR_KEY, {})
  const next: CursorMap = {}
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith(`${workflowId}:`)) next[key] = value
  }
  await storageSet(CURSOR_KEY, next)
}

function selectedItems(library: PlanTextLibrary, itemIds: unknown): PlanTextItem[] {
  if (!library.items.length) return []
  if (itemIds === 'all' || itemIds === undefined || itemIds === null) {
    return [...library.items]
  }
  if (!Array.isArray(itemIds)) return []
  if (itemIds.length === 0) return []
  const wanted = new Set(itemIds.map(String))
  return library.items.filter((item) => wanted.has(item.id))
}

/** Normalize library names for `{_Story Title}` matching */
export function normalizeLibraryToken(name: string): string {
  return name.trim().toLowerCase().replace(/[_\s]+/g, ' ')
}

/**
 * Fill prompt templates like:
 *   writing a story about {_Story Title} its long 20 minute
 * Placeholders: {_Library Name}, {_title}, {_} → current queue title.
 */
export function applyTextTemplate(
  template: string,
  args: {
    libraries: PlanTextLibrary[]
    currentLibrary: PlanTextLibrary
    currentItem: PlanTextItem
  },
): string {
  if (!template.trim()) return args.currentItem.text

  return template.replace(/\{\_([^}]*)\}/g, (_full, rawName: string) => {
    const key = normalizeLibraryToken(rawName)
    if (!key || key === 'title' || key === 'item' || key === 'value') {
      return args.currentItem.text
    }
    if (normalizeLibraryToken(args.currentLibrary.name) === key) {
      return args.currentItem.text
    }
    const other = args.libraries.find((lib) => normalizeLibraryToken(lib.name) === key)
    if (other?.items[0]) return other.items[0].text
    // Unknown token → leave as-is so the user notices
    return `{_${rawName}}`
  })
}

export function libraryPlaceholder(libraryName: string): string {
  return `{_${libraryName.trim()}}`
}

export async function loadPlanTextLibraries(planId?: string): Promise<PlanTextLibrary[]> {
  if (!planId) return []
  const workspace = await storageGet<{ plans?: AutomationPlan[] }>('planner-workspace', {
    plans: [],
  })
  const plan = (workspace.plans ?? []).find((item) => item.id === planId)
  return plan?.textLibraries ?? []
}

/** Resolve the text to type for a TypeText step */
export async function resolveTypeText(args: {
  params: Record<string, unknown>
  workflowId?: string
  nodeId?: string
  planId?: string
  libraries?: PlanTextLibrary[]
}): Promise<ResolvedTypeText> {
  const mode = String(args.params.textMode ?? 'manual') as TextSourceMode

  if (mode === 'manual' || !mode) {
    return {
      text: String(args.params.text ?? args.params.value ?? ''),
      hasMore: false,
      index: 0,
      total: 1,
    }
  }

  if (mode === 'library') {
    const libraries =
      args.libraries ?? (await loadPlanTextLibraries(args.planId ?? String(args.params.planId ?? '')))
    const libraryId = String(args.params.textLibraryId ?? '')
    const library = libraries.find((item) => item.id === libraryId || item.name === libraryId)
    if (!library) {
      throw new Error(
        libraryId
          ? `Text library "${libraryId}" not found. Create it in Workflow Planner → Text libraries.`
          : 'Select a text library (e.g. story title) for this TypeText step.',
      )
    }

    const items = selectedItems(library, args.params.textItemIds)
    if (!items.length) {
      throw new Error(
        `Library "${library.name}" has no titles. Add numbered lines in Workflow Planner.`,
      )
    }

    const template = String(args.params.textTemplate ?? '')

    const finish = (item: PlanTextItem, meta: string, extra: Partial<ResolvedTypeText>) => {
      const text = applyTextTemplate(template, {
        libraries,
        currentLibrary: library,
        currentItem: item,
      })
      return {
        text,
        meta,
        ...extra,
      } satisfies ResolvedTypeText
    }

    if (items.length === 1 || args.params.queueEnabled === false) {
      const item = items[0]!
      return finish(item, `${library.name}:${item.title}`, {
        hasMore: false,
        index: 0,
        total: 1,
      })
    }

    const queueKey = `lib:${library.id}:${items.map((item) => item.id).join(',')}`
    if (!args.workflowId || !args.nodeId) {
      return finish(items[0]!, `${library.name}:1/${items.length}`, {
        hasMore: items.length > 1,
        index: 0,
        total: items.length,
      })
    }

    // Default false so batch loops end after last title (set true only to wrap forever)
    const wrap = args.params.queueWrap === true
    const current = await getQueueCursor(args.workflowId, args.nodeId, queueKey)
    if (!wrap && current >= items.length) {
      throw new Error(
        `Library "${library.name}" finished (${items.length} titles). Run again to restart.`,
      )
    }

    const index = wrap ? current % items.length : current
    const item = items[index]!
    await setQueueCursor(args.workflowId, args.nodeId, queueKey, current + 1)
    const hasMore = wrap ? items.length > 1 : index + 1 < items.length

    return finish(item, `${library.name}:${index + 1}/${items.length}:${item.title}`, {
      hasMore,
      index,
      total: items.length,
    })
  }

  const legacy = await resolveLegacyJsonText(args)
  return { ...legacy, hasMore: false }
}

async function resolveLegacyJsonText(args: {
  params: Record<string, unknown>
  workflowId?: string
  nodeId?: string
}): Promise<{ text: string; meta?: string }> {
  const mode = String(args.params.textMode ?? '')
  const rawJson = String(args.params.textJson ?? '').trim()
  if (!rawJson) {
    return { text: String(args.params.text ?? '') }
  }

  let data: unknown
  try {
    data = JSON.parse(rawJson)
  } catch {
    throw new Error(
      'Legacy Text JSON is invalid. Switch to a Workflow Planner text library instead.',
    )
  }

  if (mode === 'json_label') {
    const label = String(args.params.textLabel ?? '')
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const value = (data as Record<string, unknown>)[label]
      if (typeof value === 'string') return { text: value, meta: `label:${label}` }
    }
    throw new Error('Select a JSON label or migrate to a Workflow Planner text library.')
  }

  let items: string[] = []
  if (Array.isArray(data)) {
    items = data.map((item) =>
      typeof item === 'string'
        ? item
        : String((item as { text?: string }).text ?? item ?? ''),
    )
  } else if (data && typeof data === 'object') {
    const key = String(args.params.textQueueKey ?? 'prompts')
    const arr = (data as Record<string, unknown>)[key]
    if (Array.isArray(arr)) {
      items = arr.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
    }
  }

  if (!items.length) {
    throw new Error('Legacy JSON queue empty. Create a Workflow Planner text library instead.')
  }

  const queueKey = String(args.params.textQueueKey ?? 'legacy')
  if (!args.workflowId || !args.nodeId) {
    return { text: items[0] ?? '', meta: `queue:${queueKey}` }
  }

  const wrap = args.params.queueWrap === true
  const current = await getQueueCursor(args.workflowId, args.nodeId, queueKey)
  const index = wrap ? current % items.length : current
  if (!wrap && index >= items.length) {
    throw new Error('Legacy text queue finished. Reset or use a Workflow Planner library.')
  }
  await setQueueCursor(args.workflowId, args.nodeId, queueKey, current + 1)
  return { text: items[index] ?? '', meta: `queue:${queueKey}:${index + 1}/${items.length}` }
}

export function typingDelayRange(
  speed: string | undefined,
): { min: number; max: number } | null {
  switch (speed) {
    case 'instant':
      return null
    case 'slow':
      return { min: 90, max: 220 }
    case 'human':
    default:
      return { min: 35, max: 110 }
  }
}
