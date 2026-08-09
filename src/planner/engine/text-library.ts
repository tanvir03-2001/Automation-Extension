import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import { getJsonAtPath } from '@/planner/engine/custom-section-paths'
import { extractTextItems } from '@/planner/engine/dataset-utils'
import { getByPath } from '@/planner/engine/path-utils'
import type {
  AutomationPlan,
  PlanDataset,
  PlanTextItem,
  PlanTextLibrary,
} from '@/planner/types/plan'

export type TextSourceMode =
  | 'manual'
  | 'library'
  | 'dataset'
  | 'loop_item'
  | 'json_label'
  | 'json_queue'

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

async function loadPlanDatasetsForText(planId?: string): Promise<PlanDataset[]> {
  if (!planId) return []
  const workspace = await storageGet<{ plans?: AutomationPlan[] }>('planner-workspace', {
    plans: [],
  })
  const plan = (workspace.plans ?? []).find((item) => item.id === planId)
  return plan?.datasets ?? []
}

function stringifyLeaf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function isPrimitiveLeaf(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

/** Coerce array elements into queueable title strings. */
function arrayToQueueTexts(value: unknown[]): string[] {
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item === 'number' || typeof item === 'boolean') return String(item)
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>
        if (typeof record.title === 'string') return record.title
        if (typeof record.text === 'string') return record.text
        if (typeof record.name === 'string') return record.name
      }
      return ''
    })
    .filter((item) => item.length > 0)
}

async function resolveQueuedStrings(args: {
  items: string[]
  queueKey: string
  metaPrefix: string
  workflowId?: string
  nodeId?: string
  wrap: boolean
  template?: string
  libraries?: PlanTextLibrary[]
  library?: PlanTextLibrary
}): Promise<ResolvedTypeText> {
  const { items, queueKey, metaPrefix, wrap } = args
  if (!items.length) {
    throw new Error('No text values found at the selected path.')
  }

  const asItem = (text: string, index: number): PlanTextItem => ({
    id: `${queueKey}:${index}`,
    title: text,
    text,
  })

  const finish = (text: string, index: number, total: number, hasMore: boolean) => {
    let out = text
    if (args.template && args.libraries && args.library) {
      out = applyTextTemplate(args.template, {
        libraries: args.libraries,
        currentLibrary: args.library,
        currentItem: asItem(text, index),
      })
    }
    return {
      text: out,
      meta: `${metaPrefix}:${index + 1}/${total}`,
      hasMore,
      index,
      total,
    } satisfies ResolvedTypeText
  }

  if (items.length === 1) {
    return finish(items[0]!, 0, 1, false)
  }

  if (!args.workflowId || !args.nodeId) {
    return finish(items[0]!, 0, items.length, items.length > 1)
  }

  const current = await getQueueCursor(args.workflowId, args.nodeId, queueKey)
  if (!wrap && current >= items.length) {
    throw new Error(`Text queue finished (${items.length} values). Run again to restart.`)
  }
  const index = wrap ? current % items.length : current
  await setQueueCursor(args.workflowId, args.nodeId, queueKey, current + 1)
  const hasMore = wrap ? items.length > 1 : index + 1 < items.length
  return finish(items[index]!, index, items.length, hasMore)
}

async function resolveDatasetText(args: {
  params: Record<string, unknown>
  workflowId?: string
  nodeId?: string
  planId?: string
  datasets?: PlanDataset[]
}): Promise<ResolvedTypeText> {
  // Prefer live EventContext / caller datasets; storage only when not provided
  let datasets = args.datasets
  if (datasets === undefined) {
    datasets = await loadPlanDatasetsForText(
      args.planId ?? String(args.params.planId ?? ''),
    )
  }
  const datasetId = String(args.params.textDatasetId ?? '').trim()
  if (!datasetId) {
    throw new Error('Select a dataset for this TypeText step.')
  }
  let dataset = datasets.find((item) => item.id === datasetId || item.name === datasetId)
  // Live list may be stale/empty while storage already has the dataset
  if (!dataset && args.datasets !== undefined) {
    const fromStorage = await loadPlanDatasetsForText(
      args.planId ?? String(args.params.planId ?? ''),
    )
    dataset = fromStorage.find((item) => item.id === datasetId || item.name === datasetId)
  }
  if (!dataset) {
    throw new Error(
      `Dataset "${datasetId}" not found. Create it in Workflow Planner → Datasets.`,
    )
  }

  const dataPath = String(args.params.textDataPath ?? '').trim()
  let value: unknown =
    !dataPath || dataPath === '$' ? dataset.data : getJsonAtPath(dataset.data, dataPath)

  // textLibrary shortcut: path at items → queue titles
  if (
    dataset.kind === 'textLibrary' &&
    (!dataPath || dataPath === '$' || dataPath === 'items')
  ) {
    const titles = extractTextItems(dataset.data).map((item) => item.title)
    return resolveQueuedStrings({
      items: titles,
      queueKey: `ds:${dataset.id}:${dataPath || 'items'}`,
      metaPrefix: `dataset:${dataset.name}`,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      wrap: args.params.queueWrap === true,
    })
  }

  if (isPrimitiveLeaf(value)) {
    return {
      text: stringifyLeaf(value),
      meta: `dataset:${dataset.name}${dataPath ? `:${dataPath}` : ''}`,
      hasMore: false,
      index: 0,
      total: 1,
    }
  }

  if (Array.isArray(value)) {
    const items = arrayToQueueTexts(value)
    return resolveQueuedStrings({
      items,
      queueKey: `ds:${dataset.id}:${dataPath || '$'}`,
      metaPrefix: `dataset:${dataset.name}`,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      wrap: args.params.queueWrap === true,
    })
  }

  throw new Error(
    `Dataset path "${dataPath || '(root)'}" is not a text value. Pick a leaf key (string, number, or boolean), or an array of titles.`,
  )
}

function resolveLoopItemText(args: {
  params: Record<string, unknown>
  variables?: Record<string, unknown>
}): ResolvedTypeText {
  const variables = args.variables ?? {}
  const itemVariable =
    String(args.params.textItemVariable ?? args.params.itemVariable ?? 'item').trim() ||
    'item'
  if (!(itemVariable in variables)) {
    throw new Error(
      `Loop item "{{${itemVariable}}}" is not available. Place this TypeText inside a Map/For loop body, or switch Source to Dataset.`,
    )
  }
  const root = variables[itemVariable]
  const itemPath = String(args.params.textItemPath ?? '').trim()
  const value = itemPath ? getByPath(root, itemPath) : root

  if (isPrimitiveLeaf(value)) {
    return {
      text: stringifyLeaf(value),
      meta: `loop:${itemVariable}${itemPath ? `.${itemPath}` : ''}`,
      hasMore: false,
      index: 0,
      total: 1,
    }
  }

  if (Array.isArray(value)) {
    const texts = arrayToQueueTexts(value)
    if (texts.length === 1) {
      return {
        text: texts[0]!,
        meta: `loop:${itemVariable}${itemPath ? `.${itemPath}` : ''}`,
        hasMore: false,
        index: 0,
        total: 1,
      }
    }
  }

  throw new Error(
    `Loop item path "{{${itemVariable}}${itemPath ? `.${itemPath}` : ''}}" is not a text value. Pick a leaf field on the current item.`,
  )
}

/** Resolve the text to type for a TypeText step */
export async function resolveTypeText(args: {
  params: Record<string, unknown>
  workflowId?: string
  nodeId?: string
  planId?: string
  libraries?: PlanTextLibrary[]
  datasets?: PlanDataset[]
  variables?: Record<string, unknown>
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

  if (mode === 'dataset') {
    return resolveDatasetText(args)
  }

  if (mode === 'loop_item') {
    return resolveLoopItemText(args)
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
