/** Resolve dotted paths including numeric array indices: `a.b.0.c`. */
export function getByPath(root: unknown, path: string): unknown {
  const cleaned = path.trim()
  if (!cleaned) return root
  return cleaned.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined
    if (Array.isArray(acc)) {
      const index = Number(key)
      if (!Number.isInteger(index)) return undefined
      return acc[index]
    }
    if (typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, root)
}

/** Set a dotted path on a JSON-like value (immutable). */
export function setByPath(root: unknown, path: string, value: unknown): unknown {
  const keys = path.trim().split('.').filter(Boolean)
  if (!keys.length) return value

  const clone =
    root && typeof root === 'object'
      ? Array.isArray(root)
        ? [...root]
        : { ...(root as Record<string, unknown>) }
      : Number.isInteger(Number(keys[0]))
        ? []
        : {}

  let cursor: unknown = clone
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]!
    const nextKey = keys[i + 1]!
    const asIndex = Number.isInteger(Number(nextKey))
    if (Array.isArray(cursor)) {
      const index = Number(key)
      const existing = cursor[index]
      const next =
        existing && typeof existing === 'object'
          ? Array.isArray(existing)
            ? [...existing]
            : { ...(existing as Record<string, unknown>) }
          : asIndex
            ? []
            : {}
      cursor[index] = next
      cursor = next
    } else if (cursor && typeof cursor === 'object') {
      const record = cursor as Record<string, unknown>
      const existing = record[key]
      const next =
        existing && typeof existing === 'object'
          ? Array.isArray(existing)
            ? [...existing]
            : { ...(existing as Record<string, unknown>) }
          : asIndex
            ? []
            : {}
      record[key] = next
      cursor = next
    }
  }

  const last = keys[keys.length - 1]!
  if (Array.isArray(cursor)) {
    cursor[Number(last)] = value
  } else if (cursor && typeof cursor === 'object') {
    ;(cursor as Record<string, unknown>)[last] = value
  }
  return clone
}
