import { getByPath } from '@/planner/engine/path-utils'
import type { LoopScope } from '@/planner/engine/loop-scope'
import type { PlanDataset } from '@/planner/types/plan'

export type JsonValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'undefined'

export type CompletionChild = {
  /** Label shown in the list. */
  key: string
  /** Path segment appended on insert (defaults to `key`). */
  insertKey?: string
  kind: JsonValueKind
  preview: string
}

/** A top-level variable available inside `${…}` / `{{…}}`. */
export type CompletionRoot = {
  /** Display label (dataset / loop var name). */
  key: string
  /** Exact text inserted as the path root inside braces. */
  insertText: string
  value: unknown
  kind: JsonValueKind
}

export type CompletionSuggestion = {
  /** Segment shown in the list. */
  key: string
  /** Full path to write inside braces after picking this item. */
  insertText: string
  kind: JsonValueKind
  preview: string
}

export function jsonValueKind(value: unknown): JsonValueKind {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'undefined'
}

export function previewJsonValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') {
    const trimmed = value.length > 40 ? `${value.slice(0, 40)}…` : value
    return JSON.stringify(trimmed)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).length} keys}`
  }
  return String(value)
}

/** Whether this kind can be drilled with `.` */
export function isDrillableKind(kind: JsonValueKind): boolean {
  return kind === 'object' || kind === 'array'
}

/**
 * Children of a JSON value for autocomplete.
 * Object arrays: sample field names first (insert as `0.field`), then numeric indices.
 * Primitive arrays: indices only.
 */
export function listChildren(value: unknown): CompletionChild[] {
  if (Array.isArray(value)) {
    const children: CompletionChild[] = []
    const sample = value[0]
    const sampleIsObject =
      sample !== null && typeof sample === 'object' && !Array.isArray(sample)

    if (sampleIsObject) {
      for (const [key, child] of Object.entries(sample as Record<string, unknown>)) {
        children.push({
          key,
          insertKey: `0.${key}`,
          kind: jsonValueKind(child),
          preview: previewJsonValue(child),
        })
      }
    }

    const limit = Math.min(value.length, 20)
    for (let i = 0; i < limit; i += 1) {
      const item = value[i]
      children.push({
        key: String(i),
        kind: jsonValueKind(item),
        preview: previewJsonValue(item),
      })
    }
    return children
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, child]) => ({
      key,
      kind: jsonValueKind(child),
      preview: previewJsonValue(child),
    }))
  }

  return []
}

/** Bare identifier path vs `dataset:Name…` when the name is not a simple word. */
export function datasetInsertRoot(name: string): string {
  if (/^[\w]+$/.test(name)) return name
  return `dataset:${name}`
}

export function buildCompletionScope(options: {
  datasets: PlanDataset[]
  loopScope: LoopScope
  /** Extra top-level variables (optional design-time samples). */
  variables?: Record<string, unknown>
}): CompletionRoot[] {
  const roots: CompletionRoot[] = []
  const used = new Set<string>()

  const push = (key: string, insertText: string, value: unknown) => {
    if (used.has(insertText)) return
    used.add(insertText)
    roots.push({
      key,
      insertText,
      value,
      kind: jsonValueKind(value),
    })
  }

  // Inside Map/For body: only iterable bindings (no plan datasets).
  if (options.loopScope.kind === 'body') {
    for (const frame of options.loopScope.stack) {
      push(frame.itemVariable, frame.itemVariable, frame.sampleItem)
      push(frame.indexVariable, frame.indexVariable, 0)
    }
    return roots
  }

  // Outside loop or on Map `completed` path: full dataset scope.
  for (const dataset of options.datasets) {
    const name = dataset.name.trim()
    if (!name) continue
    push(name, datasetInsertRoot(name), dataset.data)
  }

  if (options.variables) {
    for (const [key, value] of Object.entries(options.variables)) {
      if (key.startsWith('__')) continue
      push(key, key, value)
    }
  }

  return roots
}

function findRootMatch(
  roots: CompletionRoot[],
  path: string,
): { root: CompletionRoot; relative: string } | null {
  const sorted = [...roots].sort((a, b) => b.insertText.length - a.insertText.length)
  for (const root of sorted) {
    if (path === root.insertText) return { root, relative: '' }
    if (path.startsWith(`${root.insertText}.`)) {
      return { root, relative: path.slice(root.insertText.length + 1) }
    }
  }
  return null
}

/**
 * Suggestions for the path typed inside braces (text before caret).
 * Empty / partial root → filter roots. `user.fir` → children of `user` filtered by `fir`.
 */
export function completePath(
  roots: CompletionRoot[],
  pathBeforeCaret: string,
): CompletionSuggestion[] {
  const trimmed = pathBeforeCaret.trim()

  if (!trimmed) {
    return roots.map((root) => ({
      key: root.key,
      insertText: root.insertText,
      kind: root.kind,
      preview: previewJsonValue(root.value),
    }))
  }

  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot === -1) {
    const filter = trimmed.toLowerCase()
    return roots
      .filter(
        (root) =>
          root.key.toLowerCase().startsWith(filter) ||
          root.insertText.toLowerCase().startsWith(filter),
      )
      .map((root) => ({
        key: root.key,
        insertText: root.insertText,
        kind: root.kind,
        preview: previewJsonValue(root.value),
      }))
  }

  const parentPath = trimmed.slice(0, lastDot)
  const filter = trimmed.slice(lastDot + 1).toLowerCase()
  const match = findRootMatch(roots, parentPath)
  if (!match) return []

  const parentValue =
    match.relative === '' ? match.root.value : getByPath(match.root.value, match.relative)
  const children = listChildren(parentValue)

  return children
    .filter(
      (child) =>
        !filter ||
        child.key.toLowerCase().startsWith(filter) ||
        (child.insertKey?.toLowerCase().startsWith(filter) ?? false),
    )
    .map((child) => ({
      key: child.key,
      insertText: `${parentPath}.${child.insertKey ?? child.key}`,
      kind: child.kind,
      preview: child.preview,
    }))
}

export type ActiveTemplate = {
  /** Index of `$` or first `{` of `{{`. */
  openStart: number
  /** Index of first char inside braces (path start). */
  pathStart: number
  /** Index where path ends (caret or just before closing brace). */
  pathEnd: number
  /** Index after the closing delimiter, or -1 if still open. */
  closeEnd: number
  syntax: 'dollar' | 'mustache'
  /** Path text from brace open through caret (for filtering). */
  pathBeforeCaret: string
}

/**
 * Detect whether `cursor` sits inside `${…}` or `{{…}}` (open or closed).
 */
export function findActiveTemplate(text: string, cursor: number): ActiveTemplate | null {
  const closed = findEnclosingClosedTemplate(text, cursor)
  if (closed) return closed

  const before = text.slice(0, cursor)
  let bestOpen = -1
  let syntax: 'dollar' | 'mustache' | null = null

  for (let i = 0; i < before.length - 1; i += 1) {
    if (before[i] === '$' && before[i + 1] === '{') {
      const region = before.slice(i + 2)
      if (!region.includes('}')) {
        bestOpen = i
        syntax = 'dollar'
      }
    } else if (
      before[i] === '{' &&
      before[i + 1] === '{' &&
      (i === 0 || before[i - 1] !== '$')
    ) {
      const region = before.slice(i + 2)
      if (!region.includes('}}')) {
        bestOpen = i
        syntax = 'mustache'
      }
    }
  }

  if (bestOpen < 0 || !syntax) return null

  const pathStart = bestOpen + 2
  return {
    openStart: bestOpen,
    pathStart,
    pathEnd: cursor,
    closeEnd: -1,
    syntax,
    pathBeforeCaret: text.slice(pathStart, cursor),
  }
}

function findEnclosingClosedTemplate(text: string, cursor: number): ActiveTemplate | null {
  let i = 0
  let best: ActiveTemplate | null = null

  while (i < text.length) {
    if (text[i] === '$' && text[i + 1] === '{') {
      const pathStart = i + 2
      const close = text.indexOf('}', pathStart)
      if (close !== -1 && cursor >= pathStart && cursor <= close) {
        best = {
          openStart: i,
          pathStart,
          pathEnd: cursor,
          closeEnd: close + 1,
          syntax: 'dollar',
          pathBeforeCaret: text.slice(pathStart, cursor),
        }
      }
      i = close === -1 ? i + 2 : close + 1
      continue
    }
    if (text[i] === '{' && text[i + 1] === '{' && (i === 0 || text[i - 1] !== '$')) {
      const pathStart = i + 2
      const close = text.indexOf('}}', pathStart)
      if (close !== -1 && cursor >= pathStart && cursor <= close) {
        best = {
          openStart: i,
          pathStart,
          pathEnd: cursor,
          closeEnd: close + 2,
          syntax: 'mustache',
          pathBeforeCaret: text.slice(pathStart, cursor),
        }
      }
      i = close === -1 ? i + 2 : close + 2
      continue
    }
    i += 1
  }

  return best
}

/** Replace the path inside an active template; returns next value + caret index. */
export function applyCompletion(
  text: string,
  active: ActiveTemplate,
  insertText: string,
): { value: string; caret: number } {
  const closeToken = active.syntax === 'dollar' ? '}' : '}}'
  const before = text.slice(0, active.pathStart)
  let after: string
  let caret: number

  if (active.closeEnd >= 0) {
    // Replace path only; keep existing close
    after = text.slice(active.closeEnd - closeToken.length)
    // after starts at `}` / `}}`
    const next = `${before}${insertText}${after}`
    caret = active.pathStart + insertText.length
    return { value: next, caret }
  }

  // Unclosed: insert path + closing brace(s)
  after = text.slice(active.pathEnd)
  const next = `${before}${insertText}${closeToken}${after}`
  caret = active.pathStart + insertText.length
  return { value: next, caret }
}
