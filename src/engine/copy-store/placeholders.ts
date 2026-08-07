/**
 * Extensible {_Token} placeholder system for copy-event names.
 * Currently supports {_NumberAuto}; designed for future {_Date}, {_Time}, etc.
 */

export type PlaceholderResolver = (ctx: PlaceholderContext) => string

export interface PlaceholderContext {
  /** Next number for the current prefix series (already computed) */
  numberAuto: number
  workflowId?: string
  index?: number
  extra?: Record<string, string | number>
}

const PLACEHOLDER_RE = /\{\_([A-Za-z][A-Za-z0-9]*)\}/g

const builtInResolvers: Record<string, PlaceholderResolver> = {
  NumberAuto: (ctx) => String(ctx.numberAuto),
  // Future-ready stubs (deterministic, optional)
  Date: () => new Date().toISOString().slice(0, 10),
  Time: () => new Date().toISOString().slice(11, 19).replace(/:/g, ''),
  WorkflowId: (ctx) => String(ctx.workflowId ?? ''),
  Index: (ctx) => String(ctx.index ?? ctx.numberAuto),
  UUID: () => crypto.randomUUID?.() ?? `${Date.now().toString(16)}`,
}

const customResolvers = new Map<string, PlaceholderResolver>()

/** Register or override a placeholder token (without braces/underscore). */
export function registerPlaceholder(name: string, resolver: PlaceholderResolver): void {
  customResolvers.set(name, resolver)
}

export function hasNumberAuto(template: string): boolean {
  return template.includes('{_NumberAuto}')
}

/**
 * Extract series prefix from a dynamic name template.
 * "story-{_NumberAuto}" → "story"
 * "short-story-{_NumberAuto}" → "short-story"
 * Static names return the full string as prefix.
 */
export function extractPrefix(template: string): string {
  const marker = '{_NumberAuto}'
  const idx = template.indexOf(marker)
  if (idx === -1) return template.trim()
  let prefix = template.slice(0, idx)
  if (prefix.endsWith('-')) prefix = prefix.slice(0, -1)
  return prefix.trim()
}

export function applyPlaceholders(template: string, ctx: PlaceholderContext): string {
  return template.replace(PLACEHOLDER_RE, (full, rawName: string) => {
    const resolver = customResolvers.get(rawName) ?? builtInResolvers[rawName]
    if (!resolver) return full
    return resolver(ctx)
  })
}
