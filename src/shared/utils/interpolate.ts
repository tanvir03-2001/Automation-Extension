export function interpolate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key]
      }
      return undefined
    }, variables)

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
