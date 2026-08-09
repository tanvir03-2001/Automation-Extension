/**
 * Map loop (`loops.map`) - stack helpers shared by executor + planner-runner.
 * Kept additive so existing loop stubs keep their prior behavior.
 */

export const MAP_STACK_KEY = '__mapStack'
export const MAP_ENTRY_HANDLE_KEY = '__entryHandle'
/** Runner-internal branch when Break exits an active Map */
export const MAP_BREAK_BRANCH = '__map_break'

export type MapLoopFrame = {
  nodeId: string
  items: unknown[]
  /** Index of the item currently being processed (0-based) */
  index: number
  itemVariable: string
  indexVariable: string
  collectionKey: string
}

export function readMapStack(variables: Record<string, unknown>): MapLoopFrame[] {
  const raw = variables[MAP_STACK_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (item): item is MapLoopFrame =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as MapLoopFrame).nodeId === 'string' &&
      Array.isArray((item as MapLoopFrame).items),
  )
}

/** Coerce a workflow variable into an array for Map iteration. */
export function normalizeToArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value == null || value === '') return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed
    } catch {
      // fall through - treat as newline-separated list
    }
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>)
  return [value]
}

export function resolveCollection(
  variables: Record<string, unknown>,
  collectionKey: string,
): unknown[] {
  const key = collectionKey.trim()
  if (!key) return []
  // Support {{var}} style keys after interpolate, or bare names
  const bare = key.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
  if (Object.prototype.hasOwnProperty.call(variables, bare)) {
    return normalizeToArray(variables[bare])
  }
  if (Object.prototype.hasOwnProperty.call(variables, key)) {
    return normalizeToArray(variables[key])
  }
  return []
}
