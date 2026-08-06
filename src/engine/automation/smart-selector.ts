/**
 * Semantic selectors that survive DOM reshuffles when button text / aria / SVG identity is stable.
 *
 * Formats:
 *   ae:btn="Send"          — button-like exact visible label
 *   ae:btn~="Send"         — button-like label contains
 *   ae:aria="…" / ae:aria~="…"
 *   ae:text~="…"           — any control containing text
 *   ae:svg~="…"            — control whose SVG title/aria-label/desc matches
 *   ae:role=button;text~="New chat"  — compound
 *   normal CSS             — document.querySelector
 */

export interface SmartPickResult {
  selector: string
  fallbacks: string[]
  strategy: 'text' | 'aria' | 'css' | 'role'
  tagName: string
  text: string
  attributes: Record<string, string>
}

const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], input[type="button"], input[type="submit"], input[type="reset"], summary, [contenteditable="true"], textarea, select, input:not([type="hidden"])'

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isVisible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function inIgnoredRegion(el: Element): boolean {
  return Boolean(el.closest('pre, code, script, style, noscript, [contenteditable="true"]'))
}

function visibleLabel(el: Element): string {
  const html = el as HTMLElement
  const fromAttr =
    html.getAttribute('aria-label') ||
    html.getAttribute('title') ||
    html.getAttribute('placeholder') ||
    html.getAttribute('alt') ||
    (html instanceof HTMLInputElement ? html.value : '') ||
    ''
  if (fromAttr.trim()) return normalizeLabel(fromAttr)

  const text = normalizeLabel(html.innerText || html.textContent || '')
  return text.slice(0, 80)
}

/** Short label — rejects big containers that merely contain the word somewhere. */
function shortLabel(el: Element): string {
  const html = el as HTMLElement
  const aria = html.getAttribute('aria-label') || html.getAttribute('title') || ''
  if (aria.trim() && aria.trim().length <= 48) return normalizeLabel(aria)

  const text = normalizeLabel(html.innerText || '')
  if (!text || text.length > 48) return ''
  // Avoid matching a toolbar that includes many labels
  if ((text.match(/\s/g) || []).length > 4) return ''
  return text
}

function svgIdentity(root: Element): string {
  const svg = root.matches('svg') ? (root as SVGElement) : root.querySelector('svg')
  if (!svg) return ''
  const bits = [
    svg.getAttribute('aria-label'),
    svg.getAttribute('title'),
    svg.querySelector('title')?.textContent,
    svg.querySelector('desc')?.textContent,
    svg.getAttribute('data-icon'),
    svg.getAttribute('data-testid'),
  ]
  return normalizeLabel(bits.filter(Boolean).join(' '))
}

function collectAttributes(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const name of [
    'id',
    'name',
    'type',
    'role',
    'aria-label',
    'data-testid',
    'placeholder',
    'title',
    'href',
  ]) {
    const value = el.getAttribute(name)
    if (value) attrs[name] = value
  }
  const svg = svgIdentity(el)
  if (svg) attrs.svg = svg
  return attrs
}

function looksClickable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.matches(INTERACTIVE_SELECTOR)) return true
  if (el.getAttribute('tabindex') != null) return true
  if (typeof el.onclick === 'function') return true
  const role = el.getAttribute('role')
  if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') return true
  const style = window.getComputedStyle(el)
  if (style.cursor === 'pointer') return true
  const cls = `${el.className || ''}`
  if (/btn|button|clickable|continue/i.test(cls)) return true
  return false
}

/**
 * Climb to the real click host.
 * DeepSeek Continue is: div[role=button].ds-button > span.ds-button__content
 * Never return the inner span/background — clicks must hit role=button.
 */
export function promoteToClickHost(el: Element): HTMLElement {
  const host =
    el.closest<HTMLElement>('button, [role="button"], a[href], summary') ||
    el.closest<HTMLElement>('.ds-button, [class*="ds-button"]') ||
    el.closest<HTMLElement>(INTERACTIVE_SELECTOR)

  if (host) return host

  let cur: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement
  while (cur && cur !== document.body) {
    if (looksClickable(cur) && shortLabel(cur)) return cur
    cur = cur.parentElement
  }
  return el instanceof HTMLElement ? el : (el.parentElement as HTMLElement) || (el as HTMLElement)
}

/** Prefer the clickable host when user clicks an icon / SVG / span inside a button. */
export function resolveInteractiveTarget(el: Element): Element {
  return promoteToClickHost(el)
}

function buildCssPath(el: Element): string {
  const parts: string[] = []
  let current: Element | null = el

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
    const tag = current.tagName.toLowerCase()
    if (current.id && !/[:.]/.test(current.id) && !/\d{4,}/.test(current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`)
      break
    }

    const parent: Element | null = current.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }

    const testId = current.getAttribute('data-testid')
    if (testId) {
      parts.unshift(`[data-testid="${cssEscape(testId)}"]`)
      break
    }

    const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName)
    const index = siblings.indexOf(current) + 1
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    current = parent
    if (tag === 'body' || tag === 'html') break
  }

  return parts.join(' > ')
}

function listInteractive(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)).filter(
    (el) => isVisible(el) && !inIgnoredRegion(el),
  )
}

/** Button-like hosts only (never inner content spans). */
function listButtonLike(): HTMLElement[] {
  const found = new Set<HTMLElement>()
  for (const el of listInteractive()) found.add(promoteToClickHost(el))

  // DeepSeek / similar: role=button.ds-button and short-label pills
  const nodes = document.querySelectorAll<HTMLElement>(
    'button, a[href], [role="button"], .ds-button, [class*="ds-button"]',
  )
  for (const el of nodes) {
    if (!isVisible(el) || inIgnoredRegion(el)) continue
    const host = promoteToClickHost(el)
    const label = shortLabel(host) || visibleLabel(host)
    if (!label || label.length > 48) continue
    found.add(host)
  }

  // Text "Continue" in content span → promote to parent role=button
  for (const el of document.querySelectorAll<HTMLElement>(
    '.ds-button__content, [class*="button__content"]',
  )) {
    if (!isVisible(el) || inIgnoredRegion(el)) continue
    const label = shortLabel(el)
    if (!label) continue
    found.add(promoteToClickHost(el))
  }

  return Array.from(found)
}

function parseAeSelector(raw: string): Record<string, { op: 'exact' | 'contains'; value: string }> {
  const body = raw.slice(3)
  const result: Record<string, { op: 'exact' | 'contains'; value: string }> = {}
  // Allow ";" or ":" between compound parts: ae:role=button;text~="Continue"
  const re =
    /(btn|aria|text|svg|role|testid|name)(~?=)(?:"((?:\\.|[^"])*)"|([^\s;"/:]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const key = match[1]
    const op = match[2] === '~=' ? 'contains' : 'exact'
    let value = (match[3] ?? match[4] ?? '').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    // Fix older broken "ae:role=button:text~=..." where role value ate the rest
    if (key === 'role' && value.includes(':text')) {
      const split = value.split(/:text/)
      value = split[0] ?? value
      const rest = body.slice(match.index + match[0].length)
      if (!result.text && /~?=/.test(rest + (split[1] ? `text${split[1]}` : ''))) {
        /* handled by later matches if separator fixed */
      }
    }
    result[key] = { op, value }
  }

  // Support legacy "ae:role=button:text~=\"Continue\"" (colon instead of semicolon)
  const legacy = body.match(
    /role(~?=)(?:"((?:\\.|[^"])*)"|([^\s;"]+)):text(~?=)(?:"((?:\\.|[^"])*)"|([^\s;"]+))/,
  )
  if (legacy) {
    result.role = {
      op: legacy[1] === '~=' ? 'contains' : 'exact',
      value: (legacy[2] ?? legacy[3] ?? '').replace(/\\"/g, '"'),
    }
    result.text = {
      op: legacy[4] === '~=' ? 'contains' : 'exact',
      value: (legacy[5] ?? legacy[6] ?? '').replace(/\\"/g, '"'),
    }
  }

  return result
}

function labelMatches(label: string, needle: string, op: 'exact' | 'contains'): boolean {
  const l = label.toLowerCase()
  const n = needle.toLowerCase().trim()
  if (!n) return false
  return op === 'exact' ? l === n : l.includes(n)
}

function matchSemantic(el: Element, parts: ReturnType<typeof parseAeSelector>): boolean {
  if (parts.role) {
    const tag = el.tagName.toLowerCase()
    const role = (el.getAttribute('role') || tag).toLowerCase()
    const want = parts.role.value.toLowerCase()
    const roleOk =
      role === want ||
      (want === 'button' &&
        (tag === 'button' ||
          el.getAttribute('role') === 'button' ||
          looksClickable(el) ||
          Boolean(shortLabel(el))))
    if (!roleOk) return false
  }

  if (parts.testid) {
    const id = el.getAttribute('data-testid') ?? ''
    if (!labelMatches(id, parts.testid.value, parts.testid.op)) return false
  }

  if (parts.name) {
    const name = el.getAttribute('name') ?? ''
    if (!labelMatches(name, parts.name.value, parts.name.op)) return false
  }

  if (parts.aria) {
    const aria = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? ''
    if (!labelMatches(aria, parts.aria.value, parts.aria.op)) return false
  }

  if (parts.btn || parts.text) {
    const spec = parts.btn ?? parts.text
    const label = shortLabel(el) || visibleLabel(el)
    if (!labelMatches(label, spec!.value, spec!.op)) return false
    // Contains match on long labels is too loose for btn
    if (parts.btn && spec!.op === 'contains') {
      const short = shortLabel(el)
      if (!short || !labelMatches(short, spec!.value, 'contains')) return false
    }
  }

  if (parts.svg) {
    const svg = svgIdentity(el)
    if (!labelMatches(svg, parts.svg.value, parts.svg.op)) return false
  }

  return Object.keys(parts).length > 0
}

function scoreMatch(el: HTMLElement, parts: ReturnType<typeof parseAeSelector>): number {
  let score = 0
  const needle = (parts.btn ?? parts.text)?.value ?? parts.aria?.value ?? ''
  const label = shortLabel(el) || visibleLabel(el)
  if (needle && label.toLowerCase() === needle.toLowerCase()) score += 100
  else if (needle && label.toLowerCase().includes(needle.toLowerCase())) score += 40

  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') score += 40
  if (el.className.toString().includes('ds-button')) score += 25
  if (looksClickable(el)) score += 10
  // Penalize content-only nodes if any slip through
  if (el.className.toString().includes('__content') || el.className.toString().includes('__background')) {
    score -= 80
  }

  const rect = el.getBoundingClientRect()
  // Prefer elements lower on the page (latest message actions)
  score += Math.min(30, rect.top / 100)
  // Prefer in viewport
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) score += 15

  return score
}

function pickBest(matches: HTMLElement[], parts: ReturnType<typeof parseAeSelector>): Element | null {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]
  return matches
    .map((el) => ({ el, score: scoreMatch(el, parts) }))
    .sort((a, b) => b.score - a.score)[0]!.el
}

/** Resolve one selector string (CSS or ae: semantic). */
export function querySmart(selector: string): Element | null {
  const trimmed = selector.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ae:')) {
    const parts = parseAeSelector(trimmed)
    if (Object.keys(parts).length === 0) return null

    const useButtonPool = Boolean(parts.btn || parts.text || parts.aria || parts.svg || parts.role)
    const pool = useButtonPool ? listButtonLike() : listInteractive()
    const matches = pool
      .map((el) => promoteToClickHost(el))
      .filter((el, index, arr) => arr.indexOf(el) === index)
      .filter((el) => matchSemantic(el, parts))
    return pickBest(matches, parts)
  }

  try {
    const el = document.querySelector(trimmed)
    return el && isVisible(el) ? el : el
  } catch {
    return null
  }
}

function expectedTextFromAe(selector: string): string | null {
  if (!selector.startsWith('ae:')) return null
  const parts = parseAeSelector(selector)
  return parts.btn?.value ?? parts.text?.value ?? parts.aria?.value ?? null
}

/** Try primary then fallbacks. CSS path fallbacks must still match expected button text. */
export function querySmartWithFallbacks(
  primary: string,
  fallbacks: string[] = [],
): Element | null {
  const expectedText = expectedTextFromAe(primary)
  const seen = new Set<string>()

  for (const sel of [primary, ...fallbacks]) {
    const key = sel.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)

    // Skip fragile CSS path fallbacks unless they still show the same label
    const isCssPath = !key.startsWith('ae:') && key.includes('>')
    if (isCssPath && expectedText) {
      try {
        const el = document.querySelector(key)
        if (!el || !isVisible(el)) continue
        const label = shortLabel(el) || visibleLabel(el)
        if (!labelMatches(label, expectedText, 'contains')) continue
        return el
      } catch {
        continue
      }
    }

    const el = querySmart(key)
    if (el) return el
  }
  return null
}

export function buildSmartPick(el: Element): SmartPickResult {
  const target = resolveInteractiveTarget(el)
  const tagName = target.tagName.toLowerCase()
  const text = shortLabel(target) || visibleLabel(target)
  const attrs = collectAttributes(target)
  const svg = attrs.svg ?? ''
  const fallbacks: string[] = []
  let primary = ''
  let strategy: SmartPickResult['strategy'] = 'css'

  const testId = target.getAttribute('data-testid')
  if (testId) {
    primary = `[data-testid="${cssEscape(testId)}"]`
    fallbacks.push(`ae:testid=${quote(testId)}`)
    strategy = 'css'
  }

  const aria = target.getAttribute('aria-label')
  if (aria) {
    const ariaSel = `${tagName}[aria-label="${cssEscape(aria)}"]`
    const aeAria = `ae:aria=${quote(aria)}`
    if (!primary) {
      primary = aeAria
      strategy = 'aria'
    }
    fallbacks.push(ariaSel, aeAria)
  }

  if (text && text.length <= 60) {
    const aeBtn = `ae:btn~=${quote(text)}`
    const aeExact = `ae:btn=${quote(text)}`
    if (!primary) {
      primary = aeExact
      strategy = 'text'
    }
    fallbacks.push(aeExact, aeBtn, `ae:role=button;text~=${quote(text)}`)
  }

  if (svg) {
    const aeSvg = `ae:svg~=${quote(svg.slice(0, 48))}`
    if (!primary) {
      primary = aeSvg
      strategy = 'text'
    }
    fallbacks.push(aeSvg)
  }

  const name = target.getAttribute('name')
  if (name) {
    const nameSel = `${tagName}[name="${cssEscape(name)}"]`
    if (!primary) primary = nameSel
    fallbacks.push(nameSel, `ae:name=${quote(name)}`)
  }

  if (target.id && !/[:.]/.test(target.id) && !/\d{5,}/.test(target.id)) {
    const idSel = `#${cssEscape(target.id)}`
    if (!primary) primary = idSel
    fallbacks.push(idSel)
  }

  // CSS path last — and only as weak fallback
  const cssPath = buildCssPath(target)
  if (!primary) {
    primary = cssPath
    strategy = 'css'
  } else {
    fallbacks.push(cssPath)
  }

  const uniqueFallbacks = Array.from(new Set(fallbacks.map((s) => s.trim()).filter(Boolean))).filter(
    (s) => s !== primary,
  )

  return {
    selector: primary,
    fallbacks: uniqueFallbacks.slice(0, 8),
    strategy,
    tagName,
    text: text.slice(0, 120),
    attributes: attrs,
  }
}
