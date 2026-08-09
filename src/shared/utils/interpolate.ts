import { resolveCopyReference } from '@/engine/copy-store/copy-store'

function getPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined
    if (Array.isArray(acc)) {
      const index = Number(key)
      return Number.isInteger(index) ? acc[index] : undefined
    }
    if (typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, root)
}

function resolveDatasetRef(
  path: string,
  variables: Record<string, unknown>,
): unknown {
  // {{dataset:Name.path}} or {{DS:id.path}}
  const match = /^(?:dataset|DS):(.+)$/i.exec(path)
  if (!match) return undefined
  const rest = match[1]!.trim()
  const byName = variables.__datasets
  const byId = variables.__datasetsById
  const [head, ...tail] = rest.split('.')
  if (!head) return undefined
  let data: unknown
  if (byId && typeof byId === 'object' && head in (byId as object)) {
    data = (byId as Record<string, unknown>)[head]
  } else if (byName && typeof byName === 'object') {
    const record = byName as Record<string, unknown>
    data =
      record[head] ??
      Object.entries(record).find(([name]) => name.toLowerCase() === head.toLowerCase())?.[1]
  }
  if (data === undefined) return undefined
  if (!tail.length) return data
  return getPath(data, tail.join('.'))
}

function resolveHistoryRef(
  path: string,
  variables: Record<string, unknown>,
): unknown {
  // {{history.last.status}} / {{history.last.output}} / {{history.length}}
  if (!path.startsWith('history.') && path !== 'history') return undefined
  const history = variables.__history
  if (!history || typeof history !== 'object') return undefined
  if (path === 'history') return history
  return getPath(history, path.slice('history.'.length))
}

/**
 * Interpolate {{path}} placeholders.
 * Supports:
 * - {{variable}} / {{nested.path}} (existing)
 * - {{COPY:story-1}} / {{COPY:story-1.text}} / {{COPY:story-1.name}} / {{COPY:story-1.number}}
 * - {{COPY_NAME:story-1}} / {{COPY_NUMBER:story-1}}
 * - {{dataset:Name.path}} / {{DS:id.path}}
 * - {{history.last.status}} / {{history.last.output}} / {{history.length}}
 *
 * Unknown paths resolve to empty string (existing behavior).
 */
export function interpolate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawPath: string) => {
    const path = String(rawPath).trim()

    const copyValue = resolveCopyReference(path, variables)
    if (copyValue !== undefined) return copyValue

    const datasetValue = resolveDatasetRef(path, variables)
    if (datasetValue !== undefined && datasetValue !== null) {
      return typeof datasetValue === 'string' ? datasetValue : JSON.stringify(datasetValue)
    }

    const historyValue = resolveHistoryRef(path, variables)
    if (historyValue !== undefined && historyValue !== null) {
      return typeof historyValue === 'string' ? historyValue : JSON.stringify(historyValue)
    }

    // Legacy / normal variable path: word chars + dots only
    if (!/^[\w.]+$/.test(path)) return ''

    const value = getPath(variables, path)

    if (value === undefined || value === null) return ''
    return String(value)
  })
}

export function interpolateParams(
  params: Record<string, unknown>,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      result[key] = interpolate(value, variables)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string' ? interpolate(item, variables) : item,
      )
    } else if (value && typeof value === 'object') {
      result[key] = interpolateParams(value as Record<string, unknown>, variables)
    } else {
      result[key] = value
    }
  }

  return result
}
