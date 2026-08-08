/**
 * Discover nested array/field paths inside arbitrary JSON for Map pickers.
 * No hardcoded property names — walks whatever structure the data has.
 */

import { normalizeToArray } from '@/planner/engine/map-loop'

export const SECTION_SOURCE_PREFIX = 'section:'
export const FLAT_SUFFIX = '~flat'

export function customSectionSourceId(sectionId: string): string {
  return `${SECTION_SOURCE_PREFIX}${sectionId}`
}

export function parseCustomSectionSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(SECTION_SOURCE_PREFIX)) return null
  return sourceId.slice(SECTION_SOURCE_PREFIX.length) || null
}

/** Try JSON parse for strings; leave other values as-is. */
export function parseFlexibleData(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

/** Normalize path segments: "a.b[0].c" → ["a","b","0","c"] */
function splitPath(path: string): string[] {
  if (!path || path === '$') return []
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function getJsonAtPath(data: unknown, path: string): unknown {
  const parts = splitPath(path)
  let current: unknown = data
  for (const part of parts) {
    if (current == null) return undefined
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)]
      continue
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
      continue
    }
    return undefined
  }
  return current
}

export type JsonArrayPathOption = {
  value: string
  label: string
  hint?: string
}

/**
 * Find every list / field path users can pick for Map, including deep nests.
 * Root array → "$". Nested → "stories", "$[].title", "$[].chapters~flat", …
 */
export function discoverJsonArrayPaths(
  data: unknown,
  prefix = '',
  out: JsonArrayPathOption[] = [],
  depth = 0,
): JsonArrayPathOption[] {
  if (depth > 14) return out

  if (Array.isArray(data)) {
    const value = prefix || '$'
    const label = prefix || '(root list)'
    if (!out.some((item) => item.value === value)) {
      out.push({
        value,
        label,
        hint: `${data.length} item${data.length === 1 ? '' : 's'}`,
      })
    }

    const sample = data.find((item) => item && typeof item === 'object')
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      for (const [key, child] of Object.entries(sample as Record<string, unknown>)) {
        const fieldPath = `${value}[].${key}`
        if (Array.isArray(child)) {
          if (!out.some((item) => item.value === fieldPath)) {
            out.push({
              value: fieldPath,
              label: `${label} → ${key}`,
              hint: `list on each item (${child.length})`,
            })
          }
          const flatPath = `${fieldPath}${FLAT_SUFFIX}`
          if (!out.some((item) => item.value === flatPath)) {
            out.push({
              value: flatPath,
              label: `${label} → ${key} (flatten)`,
              hint: 'one Map item per nested element',
            })
          }
          // Deeper nests inside the nested list’s sample element
          discoverJsonArrayPaths(child, fieldPath, out, depth + 1)
        } else if (child && typeof child === 'object') {
          if (!out.some((item) => item.value === fieldPath)) {
            out.push({
              value: fieldPath,
              label: `${label} → ${key}`,
              hint: 'object on each item',
            })
          }
          discoverJsonArrayPaths(child, fieldPath, out, depth + 1)
        } else {
          if (!out.some((item) => item.value === fieldPath)) {
            out.push({
              value: fieldPath,
              label: `${label} → ${key}`,
              hint: 'value on each item',
            })
          }
        }
      }
    } else if (Array.isArray(sample)) {
      // array of arrays — offer flatten
      const flatPath = `${value}${FLAT_SUFFIX}`
      if (!out.some((item) => item.value === flatPath)) {
        out.push({
          value: flatPath,
          label: `${label} (flatten)`,
          hint: 'merge nested lists',
        })
      }
    }
    return out
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0 && !prefix) return out

    const hasArrayChild = entries.some(([, v]) => Array.isArray(v))
    if (!prefix && !hasArrayChild && entries.length > 0) {
      out.push({
        value: '$values',
        label: '(all property values)',
        hint: `${entries.length} value${entries.length === 1 ? '' : 's'}`,
      })
    }

    for (const [key, child] of entries) {
      const path = prefix ? `${prefix}.${key}` : key
      if (Array.isArray(child)) {
        discoverJsonArrayPaths(child, path, out, depth + 1)
      } else if (child && typeof child === 'object') {
        discoverJsonArrayPaths(child, path, out, depth + 1)
      } else if (!prefix) {
        // top-level scalar — not a list; skip
      }
    }
  }

  return out
}

/** Resolve a discovered path into the array Map should iterate. */
export function resolveJsonPathToArray(data: unknown, path: string): unknown[] {
  const rawPath = String(path || '$').trim() || '$'
  const flat = rawPath.endsWith(FLAT_SUFFIX)
  const basePath = flat ? rawPath.slice(0, -FLAT_SUFFIX.length) : rawPath

  if (basePath === '$values') {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const values = Object.values(data as Record<string, unknown>)
      return flat ? values.flatMap((item) => normalizeToArray(item)) : values
    }
    return []
  }

  // paths like `$[].field` or `items[].a.b` → map parent array picking nested field
  const fieldMatch = basePath.match(/^(.*)\[\]\.(.+)$/)
  if (fieldMatch) {
    const parentRaw = fieldMatch[1]!
    const parentPath = parentRaw === '' || parentRaw === '$' ? '$' : parentRaw
    const field = fieldMatch[2]!
    const parent = parentPath === '$' ? data : getJsonAtPath(data, parentPath)
    if (!Array.isArray(parent)) return []
    const mapped = parent.map((item) => {
      if (item == null) return undefined
      // field may be nested: "a.b" / "chapters"
      if (field.includes('.') || field.includes('[')) {
        return getJsonAtPath(item, field)
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return (item as Record<string, unknown>)[field]
      }
      return undefined
    })
    if (flat) {
      return mapped.flatMap((item) => normalizeToArray(item))
    }
    return mapped
  }

  if (flat && (basePath === '$' || !basePath)) {
    if (!Array.isArray(data)) return normalizeToArray(data)
    return data.flatMap((item) => normalizeToArray(item))
  }

  const value = basePath === '$' || !basePath ? data : getJsonAtPath(data, basePath)
  const asArray = normalizeToArray(value)
  if (flat) {
    return asArray.flatMap((item) => normalizeToArray(item))
  }
  return asArray
}
