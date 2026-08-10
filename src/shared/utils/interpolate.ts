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

function formatInterpolatedValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
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

/** Bare dataset name path: `User.email` → `__datasets.User.email`. */
function resolveBareDatasetPath(
  path: string,
  variables: Record<string, unknown>,
): unknown {
  const byName = variables.__datasets
  if (!byName || typeof byName !== 'object') return undefined
  const [head, ...tail] = path.split('.')
  if (!head) return undefined
  const record = byName as Record<string, unknown>
  const data =
    record[head] ??
    Object.entries(record).find(([name]) => name.toLowerCase() === head.toLowerCase())?.[1]
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

function resolveInterpolationPath(
  path: string,
  variables: Record<string, unknown>,
): string {
  const copyValue = resolveCopyReference(path, variables)
  if (copyValue !== undefined) return copyValue

  const datasetValue = resolveDatasetRef(path, variables)
  if (datasetValue !== undefined) {
    return formatInterpolatedValue(datasetValue)
  }

  const historyValue = resolveHistoryRef(path, variables)
  if (historyValue !== undefined) {
    return formatInterpolatedValue(historyValue)
  }

  // Legacy / normal variable path: word chars + dots only
  if (!/^[\w.]+$/.test(path)) return ''

  const value = getPath(variables, path)
  if (value !== undefined) {
    return formatInterpolatedValue(value)
  }

  const bareDataset = resolveBareDatasetPath(path, variables)
  if (bareDataset !== undefined) {
    return formatInterpolatedValue(bareDataset)
  }

  return ''
}

/**
 * Interpolate `${path}` and `{{path}}` placeholders.
 * Supports:
 * - ${variable} / ${nested.path} / {{variable}} / {{nested.path}}
 * - {{COPY:story-1}} / {{COPY:story-1.text}} / …
 * - {{dataset:Name.path}} / {{DS:id.path}} / bare dataset Name.path
 * - {{history.last.status}} / …
 *
 * Unknown paths resolve to empty string (existing behavior).
 * Objects/arrays stringify as JSON.
 */
export function interpolate(
  template: string,
  variables: Record<string, unknown>,
): string {
  let result = ''
  let i = 0

  while (i < template.length) {
    if (template[i] === '$' && template[i + 1] === '{') {
      const pathStart = i + 2
      const close = template.indexOf('}', pathStart)
      if (close !== -1) {
        const path = template.slice(pathStart, close).trim()
        result += resolveInterpolationPath(path, variables)
        i = close + 1
        continue
      }
    }

    if (
      template[i] === '{' &&
      template[i + 1] === '{' &&
      (i === 0 || template[i - 1] !== '$')
    ) {
      const pathStart = i + 2
      const close = template.indexOf('}}', pathStart)
      if (close !== -1) {
        const path = template.slice(pathStart, close).trim()
        result += resolveInterpolationPath(path, variables)
        i = close + 2
        continue
      }
    }

    result += template[i]
    i += 1
  }

  return result
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
