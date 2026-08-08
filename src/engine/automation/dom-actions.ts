import type { AutomationCommand, AutomationResult } from '@/shared/types/messages'
import {
  promoteToClickHost,
  querySmart,
  querySmartWithFallbacks,
} from '@/engine/automation/smart-selector'

class ElementNotFoundError extends Error {
  constructor(selector: string) {
    super(`Element not found: ${selector}`)
    this.name = 'ElementNotFoundError'
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

function findEl(selector: string, fallbacks: string[] = []): Element | null {
  return querySmartWithFallbacks(selector, fallbacks)
}

function query(selector: string, fallbacks: string[] = []): Element {
  const el = findEl(selector, fallbacks)
  if (!el) throw new ElementNotFoundError(selector)
  return el
}

function isElementVisible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isElementClickable(el: Element | null): el is HTMLElement {
  if (!isElementVisible(el)) return false
  const html = el as HTMLElement
  if ((html as HTMLButtonElement).disabled) return false
  if (html.getAttribute('aria-disabled') === 'true') return false
  const style = window.getComputedStyle(html)
  if (style.pointerEvents === 'none') return false
  return true
}

async function pollUntil(
  check: () => boolean | Element | null,
  timeoutMs: number,
  errorMessage: string,
): Promise<Element | true> {
  const initial = check()
  if (initial) return initial === true ? true : (initial as Element)

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      observer.disconnect()
      window.clearInterval(interval)
      reject(new TimeoutError(errorMessage))
    }, timeoutMs)

    const tick = () => {
      const value = check()
      if (value) {
        window.clearTimeout(timer)
        observer.disconnect()
        window.clearInterval(interval)
        resolve(value === true ? true : (value as Element))
      }
    }

    const observer = new MutationObserver(tick)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    const interval = window.setInterval(tick, 200)
  })
}

async function waitForElement(
  selector: string,
  timeoutMs = 30_000,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => findEl(selector, fallbacks),
    timeoutMs,
    `Timed out waiting for selector: ${selector}`,
  )
  return result === true ? query(selector, fallbacks) : result
}

async function waitForElementVisible(
  selector: string,
  timeoutMs = 30_000,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      const el = findEl(selector, fallbacks)
      return isElementVisible(el) ? el : null
    },
    timeoutMs,
    `Timed out waiting for visible element: ${selector}`,
  )
  return result === true ? query(selector, fallbacks) : result
}

async function waitForElementHidden(
  selector: string,
  timeoutMs = 30_000,
  fallbacks: string[] = [],
): Promise<void> {
  await pollUntil(
    () => {
      const el = findEl(selector, fallbacks)
      return !el || !isElementVisible(el) ? true : null
    },
    timeoutMs,
    `Timed out waiting for element to hide: ${selector}`,
  )
}

async function waitForClickable(
  selector: string,
  timeoutMs = 30_000,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      const el = findEl(selector, fallbacks)
      return isElementClickable(el) ? el : null
    },
    timeoutMs,
    `Timed out waiting for clickable element: ${selector}`,
  )
  return result === true ? query(selector, fallbacks) : result
}

function pageTextBlob(): string {
  return (document.body?.innerText ?? document.documentElement?.innerText ?? '').replace(/\s+/g, ' ').trim()
}

function textMatches(haystack: string, needle: string, mode: string): boolean {
  const h = haystack
  const n = needle.trim()
  if (!n) return false
  if (mode === 'exact') {
    // Exact phrase appears as its own line or whole page equals / contains as standalone phrase
    if (h === n) return true
    const lines = (document.body?.innerText ?? '').split(/\r?\n/).map((line) => line.trim())
    return lines.some((line) => line === n)
  }
  if (mode === 'regex') {
    try {
      return new RegExp(n, 'i').test(h)
    } catch {
      return false
    }
  }
  return h.includes(n)
}

async function waitForText(
  text: string,
  timeoutMs = 30_000,
  mode: string = 'contains',
): Promise<void> {
  await pollUntil(
    () => (textMatches(pageTextBlob(), text, mode) ? true : null),
    timeoutMs,
    `Timed out waiting for text (${mode}): ${text}`,
  )
}

async function waitForTextGone(
  text: string,
  timeoutMs = 30_000,
  mode: string = 'contains',
): Promise<void> {
  await pollUntil(
    () => (!textMatches(pageTextBlob(), text, mode) ? true : null),
    timeoutMs,
    `Timed out waiting for text to disappear: ${text}`,
  )
}

function elementLabelText(el: HTMLElement): string {
  return (
    el.innerText ||
    el.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('value') ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Pull the first number from UI text (e.g. "118", "$1,118.5", "Credits 118"). */
function extractNumberFromText(raw: string): number | null {
  const cleaned = raw.replace(/,/g, ' ')
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function compareNumbers(
  left: number,
  operator: string,
  right: number,
): boolean {
  switch (operator) {
    case 'gt':
      return left > right
    case 'gte':
      return left >= right
    case 'lt':
      return left < right
    case 'lte':
      return left <= right
    case 'not_equals':
      return left !== right
    case 'equals':
    default:
      return left === right
  }
}

const TEXT_CLICK_CANDIDATE_SELECTOR =
  'button, a, [role="button"], [role="combobox"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [data-slot="select-trigger"], label, span, div, li, p, h1, h2, h3, h4, td, th, summary'

const BUTTON_LIKE_SELECTOR =
  'button, a[role="button"], [role="button"], [role="combobox"], [data-slot="select-trigger"], input[type="button"], input[type="submit"], input[type="reset"], a'

function labelMatchesNeedle(label: string, needle: string, exact: boolean): boolean {
  const l = label.trim().toLowerCase()
  const n = needle.trim().toLowerCase()
  if (!n || !l) return false
  return exact ? l === n : l.includes(n)
}

function pickSmallestMatch(candidates: HTMLElement[]): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of candidates) {
    const host = promoteToClickHost(el)
    if (!isElementVisible(host)) continue
    const rect = host.getBoundingClientRect()
    const score = Math.max(1, rect.width * rect.height)
    if (score < bestScore) {
      best = host
      bestScore = score
    }
  }
  return best
}

function findButtonByLabel(label: string, exact: boolean): HTMLElement | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const matches = Array.from(document.querySelectorAll<HTMLElement>(BUTTON_LIKE_SELECTOR)).filter(
    (el) => {
      if (!isElementVisible(el)) return false
      return labelMatchesNeedle(elementLabelText(el), needle, exact)
    },
  )
  return pickSmallestMatch(matches)
}

/** Prefer the smallest visible element whose label/text equals the needle (exact). */
function findElementByExactText(label: string): HTMLElement | null {
  return findElementByTextMatch(label, true)
}

/** Find by visible text / label — contains or exact. Prefers smallest clickable host. */
function findElementByTextMatch(label: string, exact: boolean): HTMLElement | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const byButton = findButtonByLabel(label, exact)
  if (byButton) return byButton

  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(TEXT_CLICK_CANDIDATE_SELECTOR),
  ).filter((el) => {
    if (!isElementVisible(el)) return false
    return labelMatchesNeedle(elementLabelText(el), needle, exact)
  })
  return pickSmallestMatch(matches)
}

function findElementByAriaLabel(label: string, exact: boolean): HTMLElement | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const matches = Array.from(document.querySelectorAll<HTMLElement>('[aria-label], [title]')).filter(
    (el) => {
      if (!isElementVisible(el)) return false
      const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim()
      return labelMatchesNeedle(aria, needle, exact)
    },
  )
  return pickSmallestMatch(matches)
}

function findLinkByTextOrHref(label: string, exact: boolean): HTMLElement | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>('a[href], a[aria-label], [role="link"]'),
  ).filter((el) => {
    if (!isElementVisible(el)) return false
    const text = elementLabelText(el)
    const href = (el.getAttribute('href') || '').toLowerCase()
    if (labelMatchesNeedle(text, needle, exact)) return true
    return exact ? href === needle : href.includes(needle)
  })
  return pickSmallestMatch(matches)
}

async function waitForExactTextClickTarget(
  label: string,
  timeoutMs = 30_000,
  selector?: string,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      if (selector) {
        const el = findEl(selector, fallbacks)
        if (el && isElementVisible(el)) return el
      }
      return findElementByExactText(label)
    },
    timeoutMs,
    `Timed out waiting for exact match to click: ${label || selector || ''}`,
  )
  return result === true ? document.body : result
}

async function waitForTextClickTarget(
  label: string,
  exact: boolean,
  timeoutMs = 30_000,
  selector?: string,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      if (selector) {
        const el = findEl(selector, fallbacks)
        if (el && isElementVisible(el)) return el
      }
      return findElementByTextMatch(label, exact)
    },
    timeoutMs,
    `Timed out waiting for text to click (${exact ? 'exact' : 'contains'}): ${label || selector || ''}`,
  )
  return result === true ? document.body : result
}

async function waitForAriaClickTarget(
  label: string,
  exact: boolean,
  timeoutMs = 30_000,
  selector?: string,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      if (selector) {
        const el = findEl(selector, fallbacks)
        if (el && isElementVisible(el)) return el
      }
      return findElementByAriaLabel(label, exact)
    },
    timeoutMs,
    `Timed out waiting for aria-label to click: ${label || selector || ''}`,
  )
  return result === true ? document.body : result
}

async function waitForLinkClickTarget(
  label: string,
  exact: boolean,
  timeoutMs = 30_000,
  selector?: string,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      if (selector) {
        const el = findEl(selector, fallbacks)
        if (el && isElementVisible(el)) return el
      }
      return findLinkByTextOrHref(label, exact)
    },
    timeoutMs,
    `Timed out waiting for link to click: ${label || selector || ''}`,
  )
  return result === true ? document.body : result
}

/** Click at viewport coordinates using the same multi-strategy engine. */
async function robustClickAt(x: number, y: number): Promise<void> {
  const guard = document.getElementById('ae-run-guard-root') as HTMLElement | null
  const prevDisplay = guard?.style.display
  const prevVisibility = guard?.style.visibility
  const prevPointer = guard?.style.pointerEvents
  if (guard) {
    guard.style.display = 'none'
    guard.style.visibility = 'hidden'
    guard.style.pointerEvents = 'none'
  }
  try {
    const hit = document.elementFromPoint(x, y)
    if (hit instanceof Element) {
      const host = promoteToClickHost(hit)
      if (isElementVisible(host)) {
        await robustClick(host)
        return
      }
    }
    // No usable host under the point — fire CDP/MAIN at raw coordinates
    const beforeUrl = location.href
    await requestTrustedClick(x, y, 'cdp')
    await sleep(200)
    if (location.href !== beforeUrl) return
    await requestTrustedClick(x, y, 'main')
  } finally {
    if (guard) {
      guard.style.display = prevDisplay ?? ''
      guard.style.visibility = prevVisibility ?? ''
      guard.style.pointerEvents = prevPointer ?? ''
    }
  }
}

async function waitForButton(
  label: string,
  timeoutMs = 30_000,
  exact = false,
  selector?: string,
  fallbacks: string[] = [],
): Promise<Element> {
  const result = await pollUntil(
    () => {
      if (selector) {
        const el = findEl(selector, fallbacks)
        return isElementClickable(el) ? el : null
      }
      return findButtonByLabel(label, exact)
    },
    timeoutMs,
    `Timed out waiting for button: ${label || selector || ''}`,
  )
  return result === true ? document.body : result
}

function queryAny(selectors: string[]): Element | null {
  return querySmartWithFallbacks(selectors[0] ?? '', selectors.slice(1))
}

/** Wait until ChatGPT (or similar) finishes streaming a response. */
async function waitForGenerationEnd(timeoutMs = 180_000): Promise<void> {
  const stopSelectors = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop generating"]',
    'button[aria-label*="Stop streaming"]',
    'button[aria-label="Stop"]',
    'button[aria-label*="Stop"]',
  ]
  const sendSelectors = [
    'button[data-testid="send-button"]:not([disabled])',
    'button[aria-label*="Send message"]:not([disabled])',
    'button[aria-label*="Send"]:not([disabled])',
  ]

  const isGenerating = () => Boolean(queryAny(stopSelectors))
  const canSend = () => Boolean(queryAny(sendSelectors))

  const started = Date.now()

  // Phase 1: wait briefly for generation to start (Stop button)
  while (Date.now() - started < 20_000) {
    if (isGenerating()) break
    await sleep(200)
  }

  // Phase 2: wait until Stop is gone and Send is usable again
  while (Date.now() - started < timeoutMs) {
    if (!isGenerating()) {
      await sleep(800)
      if (!isGenerating() && (canSend() || Date.now() - started > 25_000)) {
        return
      }
    }
    await sleep(300)
  }

  throw new TimeoutError('Timed out waiting for AI response to finish')
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/** ChatGPT / ProseMirror often nest the real editable inside the picked node */
function resolveEditableTarget(el: HTMLElement): HTMLElement {
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return el
  const nested = el.querySelector<HTMLElement>('[contenteditable="true"]')
  if (nested) return nested
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el
  const input = el.querySelector<HTMLElement>('textarea, input')
  return input ?? el
}

function isUsableEditable(el: HTMLElement): boolean {
  if (!el || el.closest('#ae-run-guard-root')) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 40 || rect.height < 16) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  return (
    el.isContentEditable ||
    el.getAttribute('contenteditable') === 'true' ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement
  )
}

/** Prefer ChatGPT composer selectors — never the lock overlay. */
function findChatComposer(): HTMLElement | null {
  const selectors = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'div[contenteditable="true"].ProseMirror',
    'div.ProseMirror[contenteditable="true"]',
    '[id*="prompt-textarea"]',
    'form [contenteditable="true"]',
    'main [contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea[name="prompt-textarea"]',
    'textarea',
  ]

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const match = nodes.find((el) => isUsableEditable(resolveEditableTarget(el)))
    if (match) return resolveEditableTarget(match)
  }
  return null
}

async function waitForComposer(timeoutMs = 20_000): Promise<HTMLElement> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const composer = findChatComposer()
    if (composer) return composer
    await sleep(200)
  }
  throw new Error(
    'Chat composer not found. Open ChatGPT, wait for the “Ask anything” box, then retry Paste Text.',
  )
}

/** When no selector is set — type/paste into the chat composer. */
async function resolveFocusedEditable(): Promise<HTMLElement> {
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    const resolved = resolveEditableTarget(active)
    if (isUsableEditable(resolved)) return resolved
  }

  const composer = findChatComposer()
  if (composer) return composer

  return waitForComposer(12_000)
}

function isContentEditable(el: HTMLElement): boolean {
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true'
}

function readEditableText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value ?? ''
  }
  return el.innerText ?? el.textContent ?? ''
}

function placeCaretAtEnd(el: HTMLElement): void {
  el.focus()
  if (!isContentEditable(el)) return
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function clearEditable(el: HTMLElement): void {
  el.focus()

  if (isContentEditable(el)) {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('selectAll', false)
    document.execCommand('delete', false)
    if ((el.textContent ?? '').trim().length > 0) {
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, '')
    }
    return
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, '')
  }
}

function insertTextChunk(el: HTMLElement, chunk: string): void {
  el.focus()

  if (isContentEditable(el)) {
    const ok = document.execCommand('insertText', false, chunk)
    if (!ok) {
      el.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: chunk,
        }),
      )
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: chunk,
        }),
      )
    }
    return
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, el.value + chunk)
  }
}

async function typeHumanLike(
  el: HTMLElement,
  value: string,
  delayMin: number,
  delayMax: number,
): Promise<void> {
  const target = resolveEditableTarget(el)
  await previewBeforeAction(target)
  target.scrollIntoView({ block: 'center', inline: 'nearest' })
  target.focus()
  target.click()
  await sleep(80)
  clearEditable(target)
  await sleep(80)
  placeCaretAtEnd(target)

  for (const char of value) {
    insertTextChunk(target, char)
    const punct = /[.,!?;:\n]/.test(char)
    const space = char === ' '
    const extra = punct ? randomBetween(60, 140) : space ? randomBetween(25, 80) : 0
    await sleep(randomBetween(delayMin, delayMax) + extra)
  }
}

async function fillInstant(el: HTMLElement, value: string): Promise<void> {
  const target = resolveEditableTarget(el)
  await previewBeforeAction(target)
  target.scrollIntoView({ block: 'center', inline: 'nearest' })
  target.focus()
  target.click()
  await sleep(60)
  clearEditable(target)
  await sleep(40)
  placeCaretAtEnd(target)

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    setNativeValue(target, value)
    return
  }

  document.execCommand('selectAll', false)
  const ok = document.execCommand('insertText', false, value)
  if (!ok) insertTextChunk(target, value)
}

function isPlaceholderComposerText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!t) return true
  return (
    t === 'ask anything' ||
    t === 'message chatgpt' ||
    t === 'send a message' ||
    t.startsWith('ask anything') ||
    t === '​'
  )
}

function findSendButton(preferredSelector?: string): HTMLButtonElement | null {
  const selectors = [
    preferredSelector,
    'button[data-testid="send-button"]',
    'button[data-testid="composer-send-button"]',
    'button[aria-label="Send message"]',
    'button[aria-label*="Send message"]',
    'button[aria-label="Send"]',
    'button[aria-label*="Send"]',
    'form button[type="submit"]',
    '[data-testid="composer-trailing-actions"] button:last-of-type',
  ].filter(Boolean) as string[]

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
      (el): el is HTMLButtonElement => el instanceof HTMLButtonElement || el.tagName === 'BUTTON',
    ) as HTMLButtonElement[]

    const visible = nodes.filter((btn) => {
      if (!btn || btn.closest('#ae-run-guard-root')) return false
      const rect = btn.getBoundingClientRect()
      return rect.width > 8 && rect.height > 8
    })
    const enabled = visible.find(
      (btn) =>
        !btn.disabled &&
        btn.getAttribute('aria-disabled') !== 'true' &&
        btn.getAttribute('data-disabled') !== 'true',
    )
    if (enabled) return enabled
    if (visible[0]) return visible[0]
  }
  return null
}

function isSendButtonReady(preferredSelector?: string): boolean {
  const btn = findSendButton(preferredSelector)
  if (!btn) return false
  if (btn.disabled) return false
  if (btn.getAttribute('aria-disabled') === 'true') return false
  if (btn.getAttribute('data-disabled') === 'true') return false
  return true
}

function pasteLooksSuccessful(el: HTMLElement, value: string): boolean {
  // ChatGPT often enables Send only after real content lands — strongest signal.
  if (isSendButtonReady()) return true

  const got = readEditableText(el).replace(/\s+/g, ' ').trim()
  const parentText = (el.closest('form')?.innerText ?? el.parentElement?.innerText ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const combined = got.length >= parentText.length ? got : parentText
  const want = value.replace(/\s+/g, ' ').trim()

  if (!want) return true
  if (isPlaceholderComposerText(combined)) return false

  // Any non-placeholder content after paste is enough to continue to Send
  if (combined.length >= 8) return true
  if (combined.includes(want.slice(0, Math.min(24, want.length)))) return true
  return combined.length >= Math.min(want.length * 0.2, 40)
}

/** Paste full text at once (no per-character typing). */
async function pasteInstant(el: HTMLElement, value: string): Promise<void> {
  const target = resolveEditableTarget(el)
  await previewBeforeAction(target)
  target.scrollIntoView({ block: 'center', inline: 'nearest' })
  target.focus()
  target.click()
  await sleep(120)
  clearEditable(target)
  await sleep(100)
  target.focus()
  placeCaretAtEnd(target)

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    setNativeValue(target, value)
    await sleep(120)
    if (!pasteLooksSuccessful(target, value)) {
      throw new Error('Paste failed: text box stayed empty')
    }
    return
  }

  // Strategy 1: selectAll + insertText (best for ProseMirror / ChatGPT)
  document.execCommand('selectAll', false)
  document.execCommand('insertText', false, value)
  await sleep(200)
  if (pasteLooksSuccessful(target, value)) return

  // Strategy 2: chunked insert with caret at end
  clearEditable(target)
  await sleep(60)
  placeCaretAtEnd(target)
  const chunkSize = 80
  for (let i = 0; i < value.length; i += chunkSize) {
    const chunk = value.slice(i, i + chunkSize)
    const ok = document.execCommand('insertText', false, chunk)
    if (!ok) insertTextChunk(target, chunk)
    placeCaretAtEnd(target)
    await sleep(6)
  }
  await sleep(200)
  if (pasteLooksSuccessful(target, value)) return

  // Strategy 3: fillInstant fallback
  await fillInstant(target, value)
  await sleep(250)

  // Give React a moment to enable Send, then re-check
  for (let i = 0; i < 10; i += 1) {
    if (pasteLooksSuccessful(target, value)) return
    await sleep(100)
  }

  // Soft success: if composer is clearly not empty, continue (Send step will click)
  const leftover = readEditableText(target).replace(/\s+/g, ' ').trim()
  if (leftover.length >= 8 && !isPlaceholderComposerText(leftover)) return

  throw new Error(
    'Paste failed: ChatGPT composer did not accept text. Pick the Ask-anything box with “Pick with mouse”, then retry.',
  )
}

/** Show teal border on the target, wait, then the real event fires. */
const ACTION_PREVIEW_MS = 500

function flashHighlight(el: HTMLElement, durationMs = 2200): void {
  const prevOutline = el.style.outline
  const prevOffset = el.style.outlineOffset
  const prevShadow = el.style.boxShadow
  const prevTransition = el.style.transition
  const prevRadius = el.style.borderRadius
  el.style.transition = 'outline 0.15s ease, box-shadow 0.15s ease'
  el.style.outline = '3px solid #14b8a6'
  el.style.outlineOffset = '3px'
  el.style.borderRadius = el.style.borderRadius || '8px'
  el.style.boxShadow = '0 0 0 6px rgba(20,184,166,0.28)'
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  window.setTimeout(() => {
    el.style.outline = prevOutline
    el.style.outlineOffset = prevOffset
    el.style.boxShadow = prevShadow
    el.style.transition = prevTransition
    el.style.borderRadius = prevRadius
  }, durationMs)
}

/** Border first → half-second pause → caller fires the real event. */
async function previewBeforeAction(el: HTMLElement): Promise<void> {
  flashHighlight(el, ACTION_PREVIEW_MS + 2000)
  await sleep(ACTION_PREVIEW_MS)
}

async function performPointerAction(
  el: HTMLElement,
  mode: 'click' | 'double_click' | 'right_click' | 'hover' | 'click_once' = 'click',
): Promise<void> {
  const host = promoteToClickHost(el)
  await previewBeforeAction(host)
  if (mode === 'hover') {
    const rect = host.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
    }
    host.dispatchEvent(new MouseEvent('mouseover', init))
    host.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }))
    host.dispatchEvent(new MouseEvent('mousemove', init))
    return
  }
  if (mode === 'right_click') {
    const rect = host.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 2,
      buttons: 2,
    }
    host.dispatchEvent(new MouseEvent('contextmenu', init))
    return
  }
  if (mode === 'double_click') {
    await robustClick(host)
    host.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: 2,
      }),
    )
    return
  }
  if (mode === 'click_once') {
    await singleTrustedClick(host)
    return
  }
  await robustClick(host)
}

/** Run the step's real event during Quick test (after green highlight). */
async function triggerQuickTestEvent(
  host: HTMLElement,
  actionId: string,
  command: AutomationCommand,
): Promise<string | null> {
  const id = actionId.trim()
  if (!id) return null

  if (
    id === 'mouse.click' ||
    id === 'element.click' ||
    id === 'mouse.click_exact' ||
    id === 'mouse.click_text' ||
    id === 'mouse.click_aria' ||
    id === 'mouse.click_button' ||
    id === 'mouse.click_link'
  ) {
    await performPointerAction(host, 'click')
    return 'clicked'
  }
  if (id === 'downloads.click_download') {
    await performPointerAction(host, 'click_once')
    return 'download clicked once'
  }
  if (id === 'ai.click_send') {
    await clickChatSend(command.selector, Math.min(command.timeoutMs ?? 8_000, 8_000))
    return 'send clicked'
  }
  if (id === 'mouse.double_click') {
    await performPointerAction(host, 'double_click')
    return 'double-clicked'
  }
  if (id === 'mouse.right_click') {
    await performPointerAction(host, 'right_click')
    return 'right-clicked'
  }
  if (id === 'mouse.hover') {
    await performPointerAction(host, 'hover')
    return 'hovered'
  }
  if (id === 'keyboard.paste_text') {
    const value = String(command.value ?? command.text ?? '')
    if (!value) {
      host.focus()
      return 'focused (no paste text set)'
    }
    await pasteInstant(host, value)
    return 'pasted'
  }
  if (id === 'keyboard.type_text') {
    const value = String(command.value ?? command.text ?? '')
    if (!value) {
      host.focus()
      return 'focused (no type text set)'
    }
    await typeHumanLike(host, value, 20, 45)
    return 'typed'
  }
  if (id === 'keyboard.fill' || id === 'keyboard.clear_and_type') {
    const value = String(command.value ?? command.text ?? '')
    if (value) {
      await fillInstant(host, value)
      return 'filled'
    }
    host.focus()
    return 'focused'
  }

  // Wait / condition / extract — find + highlight only
  return null
}

async function requestTrustedClick(
  x: number,
  y: number,
  mode: 'cdp' | 'main' | 'auto' = 'auto',
): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'TRUSTED_CLICK',
      payload: { x, y, mode },
    })) as { ok?: boolean }
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

async function requestTrustedKeys(keys: string[]): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'TRUSTED_KEYS',
      payload: { keys },
    })) as { ok?: boolean }
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

const PRESS_MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

function normalizePressChord(keys: string[]): string[] {
  const aliases: Record<string, string> = {
    ctrl: 'Control',
    control: 'Control',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
    cmd: 'Meta',
    command: 'Meta',
    win: 'Meta',
    esc: 'Escape',
    escape: 'Escape',
    enter: 'Enter',
    return: 'Enter',
    space: ' ',
    spacebar: ' ',
    backspace: 'Backspace',
    del: 'Delete',
    delete: 'Delete',
  }
  const unique: string[] = []
  for (const raw of keys) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const lower = t.toLowerCase()
    let next = aliases[lower] ?? t
    if (/^[a-z]$/i.test(next)) next = next.toUpperCase()
    if (/^f([1-9]|1[0-2])$/i.test(next)) next = next.toUpperCase()
    if (!unique.includes(next)) unique.push(next)
  }
  const orderedMods = ['Control', 'Alt', 'Shift', 'Meta'].filter((m) => unique.includes(m))
  const rest = unique.filter((k) => !PRESS_MODIFIERS.has(k))
  return [...orderedMods, ...rest]
}

function keyEventInit(
  key: string,
  mods: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean },
): KeyboardEventInit {
  const codeMap: Record<string, string> = {
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    ' ': 'Space',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Control: 'ControlLeft',
    Alt: 'AltLeft',
    Shift: 'ShiftLeft',
    Meta: 'MetaLeft',
  }
  let code = codeMap[key]
  let eventKey = key
  if (/^[A-Z]$/.test(key)) {
    code = `Key${key}`
    eventKey = mods.shiftKey ? key : key.toLowerCase()
  } else if (/^[0-9]$/.test(key)) {
    code = `Digit${key}`
  } else if (/^F([1-9]|1[0-2])$/.test(key)) {
    code = key
  }
  return {
    key: eventKey,
    code: code ?? key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: mods.ctrlKey,
    altKey: mods.altKey,
    shiftKey: mods.shiftKey,
    metaKey: mods.metaKey,
  }
}

async function dispatchKeyChord(target: HTMLElement, keys: string[]): Promise<void> {
  const chord = normalizePressChord(keys)
  if (chord.length === 0) return
  const mods = {
    ctrlKey: chord.includes('Control'),
    altKey: chord.includes('Alt'),
    shiftKey: chord.includes('Shift'),
    metaKey: chord.includes('Meta'),
  }

  // Hold modifiers down, press main keys, then release modifiers
  for (const key of chord.filter((k) => PRESS_MODIFIERS.has(k))) {
    target.dispatchEvent(new KeyboardEvent('keydown', keyEventInit(key, mods)))
    await sleep(20)
  }
  for (const key of chord.filter((k) => !PRESS_MODIFIERS.has(k))) {
    const init = keyEventInit(key, mods)
    target.dispatchEvent(new KeyboardEvent('keydown', init))
    target.dispatchEvent(new KeyboardEvent('keypress', init))
    await sleep(30)
    target.dispatchEvent(new KeyboardEvent('keyup', init))
    await sleep(20)
  }
  for (const key of [...chord].reverse().filter((k) => PRESS_MODIFIERS.has(k))) {
    target.dispatchEvent(new KeyboardEvent('keyup', keyEventInit(key, mods)))
    await sleep(15)
  }
}

const OVERLAY_UI_SELECTOR = [
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  '[data-radix-popper-content-wrapper]',
  '[data-radix-menu-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-select-content]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="menu-content"]',
  '[data-state="open"]',
  '[aria-expanded="true"]',
].join(', ')

function countOpenMenus(): number {
  let n = 0
  const nodes = document.querySelectorAll<HTMLElement>(OVERLAY_UI_SELECTOR)
  for (const el of nodes) {
    if (!el.isConnected) continue
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 2 && rect.height > 2) n += 1
  }
  return n
}

/** Profile / account / dropdown toggles — a second click closes what the first opened. */
function looksLikeToggleMenuHost(el: HTMLElement): boolean {
  if (el.getAttribute('aria-haspopup')) return true
  if (el.getAttribute('aria-expanded') != null) return true
  const state = el.getAttribute('data-state')
  if (state === 'open' || state === 'closed') return true
  if (
    el.closest(
      '[data-slot="dropdown-menu-trigger"], [data-slot="popover-trigger"], [data-radix-collection-item]',
    )
  ) {
    return true
  }
  const role = (el.getAttribute('role') || '').toLowerCase()
  if (role === 'menu' || role === 'menuitem') return true
  const label = (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.innerText ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (
    /\b(profile|account|avatar|user menu|open menu|settings menu|logout|personal)\b/.test(
      label,
    )
  ) {
    return true
  }
  // Compact circular avatar controls (sidebar profile)
  const rect = el.getBoundingClientRect()
  if (
    rect.width > 0 &&
    rect.width <= 56 &&
    rect.height > 0 &&
    rect.height <= 56 &&
    Math.abs(rect.width - rect.height) < 12 &&
    (el.tagName === 'BUTTON' || role === 'button')
  ) {
    return true
  }
  return false
}

interface ClickSnapshot {
  url: string
  path: string
  title: string
  expanded: string | null
  pressed: string | null
  dataState: string | null
  openMenus: number
  bodyChildCount: number
  connected: boolean
}

function snapshotClickState(el: HTMLElement): ClickSnapshot {
  return {
    url: location.href,
    path: location.pathname + location.search + location.hash,
    title: document.title,
    expanded: el.getAttribute('aria-expanded'),
    pressed: el.getAttribute('aria-pressed'),
    dataState: el.getAttribute('data-state'),
    openMenus: countOpenMenus(),
    bodyChildCount: document.body?.childElementCount ?? 0,
    connected: el.isConnected,
  }
}

function clickHadEffect(before: ClickSnapshot, el: HTMLElement | null): boolean {
  if (location.href !== before.url) return true
  if (location.pathname + location.search + location.hash !== before.path) return true
  if (document.title !== before.title) return true
  if (!el || !el.isConnected) return true
  if (el.getAttribute('aria-expanded') !== before.expanded) return true
  if (el.getAttribute('aria-pressed') !== before.pressed) return true
  if (el.getAttribute('data-state') !== before.dataState) return true
  if (countOpenMenus() !== before.openMenus) return true
  // Portaled menus often append a node under body without aria hooks we know
  if ((document.body?.childElementCount ?? 0) !== before.bodyChildCount) return true
  return false
}

/** Pick a point on the target that elementFromPoint still resolves to it (or a child). */
function resolveClickPoint(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  const fractions: Array<[number, number]> = [
    [0.5, 0.5],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.15, 0.15],
    [0.85, 0.85],
    [0.1, 0.5],
    [0.9, 0.5],
  ]
  for (const [fx, fy] of fractions) {
    const x = rect.left + Math.max(1, rect.width) * fx
    const y = rect.top + Math.max(1, rect.height) * fy
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
    const hit = document.elementFromPoint(x, y)
    if (!hit) continue
    if (el === hit || el.contains(hit) || hit.contains(el)) {
      return { x, y }
    }
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function invokeReactClick(el: HTMLElement, x: number, y: number): boolean {
  let current: HTMLElement | null = el
  while (current && current !== document.body) {
    const propKey = Object.keys(current).find(
      (key) =>
        key.startsWith('__reactProps$') ||
        key.startsWith('__reactEventHandlers$') ||
        key.startsWith('__reactFiber$'),
    )
    if (propKey) {
      const bag = (current as unknown as Record<string, unknown>)[propKey] as Record<
        string,
        unknown
      > | null
      const props =
        (bag?.memoizedProps as Record<string, unknown> | undefined) ||
        (bag?.pendingProps as Record<string, unknown> | undefined) ||
        bag
      for (const name of ['onClick', 'onMouseUp', 'onPointerUp', 'onMouseDown', 'onPointerDown']) {
        const fn = props?.[name]
        if (typeof fn === 'function') {
          try {
            ;(fn as (event: Record<string, unknown>) => void)({
              preventDefault() {},
              stopPropagation() {},
              persist() {},
              target: current,
              currentTarget: current,
              type: name.slice(2).toLowerCase(),
              bubbles: true,
              cancelable: true,
              isTrusted: true,
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: y,
              nativeEvent: new MouseEvent('click', {
                bubbles: true,
                clientX: x,
                clientY: y,
              }),
            })
            return true
          } catch {
            /* try next */
          }
        }
      }
    }
    current = current.parentElement
  }
  return false
}

function activateElementNative(el: HTMLElement): void {
  const link = el.closest('a[href]') as HTMLAnchorElement | null
  if (link?.href) {
    link.click()
    return
  }
  try {
    el.click()
  } catch {
    /* ignore */
  }
}

/** True when a visible menu / dialog / popover is still open on the page. */
function hasOpenOverlayUi(): boolean {
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="menu"], [role="listbox"], [role="dialog"], [aria-modal="true"], [data-state="open"], [data-radix-menu-content], [data-headlessui-state="open"]',
  )
  for (const el of nodes) {
    if (!el.isConnected) continue
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      continue
    }
    const rect = el.getBoundingClientRect()
    if (rect.width > 2 && rect.height > 2) return true
  }
  return false
}

/**
 * Sites often set overflow:hidden on <html>/<body> while a menu is open.
 * After a failed/toggle click the menu can close while scroll-lock sticks — restore it.
 * Leave lock alone while a menu/dialog is still visible.
 */
function restorePageScrollIfStale(): void {
  if (hasOpenOverlayUi()) return

  for (const el of [document.documentElement, document.body]) {
    if (!el) continue
    let clearedOverflow = false
    if (el.style.overflow === 'hidden') {
      el.style.overflow = ''
      clearedOverflow = true
    }
    if (el.style.overflowY === 'hidden') {
      el.style.overflowY = ''
      clearedOverflow = true
    }
    if (el.style.overflowX === 'hidden') {
      el.style.overflowX = ''
      clearedOverflow = true
    }
    if (
      el.classList.contains('overflow-hidden') ||
      el.classList.contains('overflow-y-hidden') ||
      el.classList.contains('overflow-x-hidden')
    ) {
      el.classList.remove('overflow-hidden', 'overflow-y-hidden', 'overflow-x-hidden')
      clearedOverflow = true
    }
    // Scrollbar-gutter compensation left behind by some UI libs after a stuck lock
    if (clearedOverflow && el.style.paddingRight) {
      const n = Number.parseFloat(el.style.paddingRight)
      if (Number.isFinite(n) && n > 0 && n <= 40) el.style.paddingRight = ''
    }
  }
}

async function dispatchSyntheticClick(clickTarget: HTMLElement, x: number, y: number): Promise<void> {
  const mouseInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: 1,
    detail: 1,
  }
  const pointerInit: PointerEventInit = {
    ...mouseInit,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }

  clickTarget.dispatchEvent(new PointerEvent('pointerdown', pointerInit))
  clickTarget.dispatchEvent(new MouseEvent('mousedown', mouseInit))
  await sleep(40)
  clickTarget.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }))
  clickTarget.dispatchEvent(new MouseEvent('mouseup', { ...mouseInit, buttons: 0 }))
  clickTarget.dispatchEvent(new MouseEvent('click', { ...mouseInit, buttons: 0 }))
}

/**
 * Single trusted click only — never retries with a second strategy.
 * Used for Download Click so browsers never start two downloads.
 */
async function singleTrustedClick(el: HTMLElement): Promise<void> {
  const clickTarget = promoteToClickHost(el)
  const guard = document.getElementById('ae-run-guard-root') as HTMLElement | null
  const prevDisplay = guard?.style.display
  const prevVisibility = guard?.style.visibility
  const prevPointer = guard?.style.pointerEvents
  if (guard) {
    guard.style.display = 'none'
    guard.style.visibility = 'hidden'
    guard.style.pointerEvents = 'none'
  }

  try {
    clickTarget.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant' as ScrollBehavior,
    })
    await sleep(120)

    const rect = clickTarget.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) {
      throw new Error('Download click target has no size — re-pick the Download button')
    }

    const { x, y } = resolveClickPoint(clickTarget)
    try {
      clickTarget.focus({ preventScroll: true })
    } catch {
      /* ignore */
    }

    // Exactly one CDP click — no MAIN / synthetic / React fallbacks
    const ok = await requestTrustedClick(x, y, 'cdp')
    if (!ok) {
      throw new Error(
        'Download Click failed to fire a trusted click. Keep the page focused and retry.',
      )
    }
    await sleep(200)
  } finally {
    if (guard) {
      guard.style.display = prevDisplay ?? ''
      guard.style.visibility = prevVisibility ?? ''
      guard.style.pointerEvents = prevPointer ?? ''
    }
  }
}

/**
 * Universal click for buttons, links, menus, Next.js nav, DeepSeek, etc.
 *
 * Strategy (stop as soon as the page reacts — avoids open→close on toggles):
 *  1) CDP trusted click at a hit-tested point
 *  2) If no effect → MAIN-world (skipped when CDP already fired on a toggle/menu)
 *  3) If still no effect → isolated synthetic events
 *  4) If still no effect → React props invoke OR native .click()
 */
async function robustClick(el: HTMLElement): Promise<void> {
  const clickTarget = promoteToClickHost(el)
  const isToggle = looksLikeToggleMenuHost(clickTarget)
  const guard = document.getElementById('ae-run-guard-root') as HTMLElement | null
  const prevDisplay = guard?.style.display
  const prevVisibility = guard?.style.visibility
  const prevPointer = guard?.style.pointerEvents
  if (guard) {
    guard.style.display = 'none'
    guard.style.visibility = 'hidden'
    guard.style.pointerEvents = 'none'
  }

  try {
    clickTarget.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant' as ScrollBehavior,
    })
    await sleep(120)

    const rect = clickTarget.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) {
      throw new Error('Click target has no size — selector may point to a hidden node')
    }

    const { x, y } = resolveClickPoint(clickTarget)

    try {
      clickTarget.focus({ preventScroll: true })
    } catch {
      /* ignore */
    }

    const before = snapshotClickState(clickTarget)

    const waitForEffect = async (budgetMs: number): Promise<boolean> => {
      const started = Date.now()
      while (Date.now() - started < budgetMs) {
        if (clickHadEffect(before, clickTarget)) return true
        await sleep(40)
      }
      return clickHadEffect(before, clickTarget)
    }

    // Toggle menus (profile avatar, dropdowns): one CDP click only.
    // A second strategy almost always closes the menu that just opened.
    if (isToggle) {
      const cdpOk = await requestTrustedClick(x, y, 'cdp')
      if (cdpOk) {
        await waitForEffect(450)
        restorePageScrollIfStale()
        return
      }
      // CDP unavailable — one MAIN attempt only, then stop
      await requestTrustedClick(x, y, 'main')
      await waitForEffect(280)
      restorePageScrollIfStale()
      return
    }

    // 1) Trusted CDP (isTrusted=true) — required by many modern apps
    const cdpOk = await requestTrustedClick(x, y, 'cdp')
    if (cdpOk) {
      // CDP already delivered one real click — never stack another strategy
      // (profile menus / toggles open then immediately close otherwise).
      await waitForEffect(400)
      restorePageScrollIfStale()
      return
    }

    // 2) MAIN world — only when CDP attach/send failed
    await requestTrustedClick(x, y, 'main')
    if (await waitForEffect(280)) {
      restorePageScrollIfStale()
      return
    }

    // 3) Isolated-world synthetic pointer sequence
    await dispatchSyntheticClick(clickTarget, x, y)
    if (await waitForEffect(200)) {
      restorePageScrollIfStale()
      return
    }

    // 4) Last resort: React fiber handler XOR native activation (not both)
    if (!invokeReactClick(clickTarget, x, y)) {
      activateElementNative(clickTarget)
    }
    await waitForEffect(200)
    restorePageScrollIfStale()
  } finally {
    if (guard) {
      guard.style.display = prevDisplay ?? ''
      guard.style.visibility = prevVisibility ?? ''
      guard.style.pointerEvents = prevPointer ?? ''
    }
  }
}

async function clickChatSend(selector?: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const btn = findSendButton(selector)
    if (btn && isSendButtonReady(selector)) {
      // performPointerAction shows border → 500ms → click
      await performPointerAction(btn, 'click')
      return
    }
    await sleep(200)
  }

  // Fallback: Enter in composer (ChatGPT often sends on Enter)
  const composer = findChatComposer()
  if (composer) {
    await previewBeforeAction(composer)
    composer.focus()
    placeCaretAtEnd(composer)
    composer.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    )
    composer.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    )
    await sleep(150)
    return
  }

  throw new Error(
    'Send button not ready. Make sure PasteText put text in the box, then Pick the Send button with mouse.',
  )
}

export async function executeDomCommand(command: AutomationCommand): Promise<AutomationResult> {
  const fb = command.fallbacks ?? []
  try {
    switch (command.action) {
      case 'waitForElement': {
        if (!command.selector) throw new Error('selector is required')
        await waitForElement(command.selector, command.timeoutMs, fb)
        return { ok: true }
      }
      case 'waitForElementVisible': {
        if (!command.selector) throw new Error('selector is required')
        await waitForElementVisible(command.selector, command.timeoutMs, fb)
        return { ok: true }
      }
      case 'waitForElementHidden': {
        if (!command.selector) throw new Error('selector is required')
        await waitForElementHidden(command.selector, command.timeoutMs, fb)
        return { ok: true }
      }
      case 'waitForClickable': {
        if (!command.selector) throw new Error('selector is required')
        await waitForClickable(command.selector, command.timeoutMs, fb)
        return { ok: true }
      }
      case 'waitForText': {
        if (!command.text) throw new Error('text is required')
        await waitForText(
          command.text,
          command.timeoutMs,
          String(command.options?.matchMode ?? 'contains'),
        )
        return { ok: true }
      }
      case 'waitForExactText': {
        if (!command.text) throw new Error('text is required')
        await waitForText(command.text, command.timeoutMs, 'exact')
        return { ok: true }
      }
      case 'waitForTextGone': {
        if (!command.text) throw new Error('text is required')
        await waitForTextGone(
          command.text,
          command.timeoutMs,
          String(command.options?.matchMode ?? 'contains'),
        )
        return { ok: true }
      }
      case 'waitForButton': {
        const label = command.text ?? command.value ?? ''
        const exact = Boolean(command.options?.exact)
        await waitForButton(label, command.timeoutMs, exact, command.selector, fb)
        return { ok: true }
      }
      case 'waitForGenerationEnd': {
        await waitForGenerationEnd(command.timeoutMs ?? 180_000)
        return { ok: true }
      }
      case 'click': {
        if (!command.selector) throw new Error('selector is required')
        // Prefer clickable host; wait until it is actually clickable when possible
        let el: Element
        try {
          el = await waitForClickable(command.selector, Math.min(command.timeoutMs ?? 30_000, 12_000), fb)
        } catch {
          el = await waitForElement(command.selector, command.timeoutMs, fb)
        }
        const mode = String(command.options?.mode ?? 'click') as
          | 'click'
          | 'double_click'
          | 'right_click'
          | 'hover'
          | 'click_once'
        await performPointerAction(
          promoteToClickHost(el),
          mode === 'double_click' ||
            mode === 'right_click' ||
            mode === 'hover' ||
            mode === 'click_once'
            ? mode
            : 'click',
        )
        return { ok: true }
      }
      case 'clickOnce': {
        if (!command.selector) throw new Error('selector is required — Pick the Download button')
        let el: Element
        try {
          el = await waitForClickable(command.selector, Math.min(command.timeoutMs ?? 30_000, 12_000), fb)
        } catch {
          el = await waitForElement(command.selector, command.timeoutMs, fb)
        }
        await performPointerAction(promoteToClickHost(el), 'click_once')
        return { ok: true }
      }
      case 'clickExact': {
        const label = String(command.text ?? command.value ?? '').trim()
        if (!label && !command.selector) {
          throw new Error('Exact text or a picked selector is required')
        }
        const el = await waitForExactTextClickTarget(
          label,
          command.timeoutMs,
          command.selector,
          fb,
        )
        await performPointerAction(promoteToClickHost(el), 'click')
        return { ok: true, data: { matchedText: label || undefined } }
      }
      case 'clickByText': {
        const label = String(command.text ?? command.value ?? '').trim()
        if (!label && !command.selector) {
          throw new Error('Text to find is required (or Pick with mouse)')
        }
        const exact = String(command.options?.matchMode ?? 'contains') === 'exact'
        const el = await waitForTextClickTarget(
          label,
          exact,
          command.timeoutMs,
          command.selector,
          fb,
        )
        await performPointerAction(promoteToClickHost(el), 'click')
        return { ok: true, data: { matchedText: label || undefined, matchMode: exact ? 'exact' : 'contains' } }
      }
      case 'clickByAria': {
        const label = String(command.text ?? command.value ?? '').trim()
        if (!label && !command.selector) {
          throw new Error('Aria label is required (or Pick with mouse)')
        }
        const exact = String(command.options?.matchMode ?? 'exact') !== 'contains'
        const el = await waitForAriaClickTarget(
          label,
          exact,
          command.timeoutMs,
          command.selector,
          fb,
        )
        await performPointerAction(promoteToClickHost(el), 'click')
        return { ok: true, data: { matchedAria: label || undefined } }
      }
      case 'clickByButton': {
        const label = String(command.text ?? command.value ?? '').trim()
        if (!label && !command.selector) {
          throw new Error('Button name is required (or Pick with mouse)')
        }
        const exact = String(command.options?.matchMode ?? 'contains') === 'exact'
        const el = await waitForButton(label, command.timeoutMs, exact, command.selector, fb)
        await performPointerAction(promoteToClickHost(el), 'click')
        return { ok: true, data: { matchedButton: label || undefined } }
      }
      case 'clickByLink': {
        const label = String(command.text ?? command.value ?? '').trim()
        if (!label && !command.selector) {
          throw new Error('Link text or href is required (or Pick with mouse)')
        }
        const exact = String(command.options?.matchMode ?? 'contains') === 'exact'
        const el = await waitForLinkClickTarget(
          label,
          exact,
          command.timeoutMs,
          command.selector,
          fb,
        )
        await performPointerAction(promoteToClickHost(el), 'click')
        return { ok: true, data: { matchedLink: label || undefined } }
      }
      case 'clickAt': {
        const x = Number(command.options?.x ?? command.value)
        const y = Number(command.options?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('Valid X and Y coordinates are required')
        }
        await robustClickAt(x, y)
        return { ok: true, data: { x, y } }
      }
      case 'clickSend': {
        await clickChatSend(command.selector, command.timeoutMs ?? 20_000)
        return { ok: true }
      }
      case 'type':
      case 'fill':
      case 'paste': {
        const value = command.value ?? command.text ?? ''
        const humanTyping = Boolean(command.options?.humanTyping)
        const delayMin = Number(command.options?.delayMin ?? 45)
        const delayMax = Number(command.options?.delayMax ?? 120)

        let el: HTMLElement
        if (command.selector) {
          el = (await waitForElement(command.selector, command.timeoutMs, fb)) as HTMLElement
        } else {
          // Allow Type/Paste after Click(New chat) when cursor is already focused
          await sleep(200)
          el = await resolveFocusedEditable()
        }

        if (command.action === 'paste') {
          await pasteInstant(el, value)
          return { ok: true }
        }

        if (humanTyping && value.length > 0) {
          await typeHumanLike(el, value, delayMin, delayMax)
          return { ok: true }
        }

        await fillInstant(el, value)
        return { ok: true }
      }
      case 'select': {
        if (!command.selector) throw new Error('selector is required')
        const el = (await waitForElement(
          command.selector,
          command.timeoutMs,
          fb,
        )) as HTMLSelectElement
        await previewBeforeAction(el)
        el.value = command.value ?? ''
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { ok: true }
      }
      case 'pressKey': {
        const target = command.selector
          ? ((await waitForElement(command.selector, command.timeoutMs, fb)) as HTMLElement)
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : document.body
        await previewBeforeAction(target)
        try {
          target.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }

        const rawKeys = Array.isArray(command.options?.keys)
          ? (command.options!.keys as unknown[]).map((k) => String(k))
          : String(command.key ?? command.value ?? 'Enter')
              .split('+')
              .map((part) => part.trim())
              .filter(Boolean)

        const chord = normalizePressChord(rawKeys)
        // Trusted CDP chord first — avoid double-firing Enter/shortcuts
        const trusted = await requestTrustedKeys(chord)
        if (!trusted) {
          await dispatchKeyChord(target, chord)
        }
        return { ok: true, data: { keys: chord, trusted } }
      }
      case 'scroll': {
        if (command.selector) {
          const el = (await waitForElement(
            command.selector,
            command.timeoutMs,
            fb,
          )) as HTMLElement
          await previewBeforeAction(el)
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else {
          window.scrollBy(0, Number(command.options?.y ?? 600))
        }
        return { ok: true }
      }
      case 'extractText': {
        if (!command.selector) throw new Error('selector is required')
        const el = (await waitForElement(command.selector, command.timeoutMs, fb)) as HTMLElement
        const data = (el.innerText ?? el.textContent ?? '').trim()
        return { ok: true, data }
      }
      case 'writeClipboard': {
        const value = String(command.value ?? command.text ?? '')
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value)
            return { ok: true, data: { method: 'clipboard-api', length: value.length } }
          }
        } catch {
          // fall through to execCommand
        }
        const ta = document.createElement('textarea')
        ta.value = value
        ta.setAttribute('readonly', '')
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (!ok) throw new Error('Clipboard write failed')
        return { ok: true, data: { method: 'execCommand', length: value.length } }
      }
      case 'readClipboard': {
        try {
          if (navigator.clipboard?.readText) {
            const data = await navigator.clipboard.readText()
            return { ok: true, data }
          }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Clipboard read failed',
          }
        }
        return { ok: false, error: 'Clipboard read API unavailable' }
      }
      case 'extractAttribute': {
        if (!command.selector || !command.attribute) {
          throw new Error('selector and attribute are required')
        }
        const el = await waitForElement(command.selector, command.timeoutMs, fb)
        return { ok: true, data: el.getAttribute(command.attribute) }
      }
      case 'assertElement': {
        if (!command.selector) throw new Error('selector is required')
        query(command.selector, fb)
        return { ok: true }
      }
      case 'testSelector': {
        const primary = String(command.selector ?? '').trim()
        const textHint = String(command.text ?? '').trim()
        const kind = String(command.options?.kind ?? 'selector')
        const actionId = String(command.options?.actionId ?? '')
        const fireEvent = command.options?.fireEvent !== false

        let el: Element | null = null
        let matchedBy = ''

        if (kind === 'button_name' && textHint) {
          el = findButtonByLabel(textHint, Boolean(command.options?.exact))
          matchedBy = el ? `button label “${textHint}”` : ''
        } else if (kind === 'text_present' && textHint) {
          const present = textMatches(
            pageTextBlob(),
            textHint,
            String(command.options?.matchMode ?? 'contains'),
          )
          return {
            ok: true,
            data: {
              found: present,
              visible: present,
              clickable: false,
              matchedBy: present ? `page text “${textHint}”` : '',
              tagName: '',
              text: textHint,
              triggered: null,
              message: present
                ? `OK — page-এ “${textHint}” পাওয়া গেছে`
                : `Fail — page-এ “${textHint}” নেই`,
            },
          }
        } else if (actionId === 'ai.click_send' && !primary && fb.length === 0) {
          el = findSendButton(undefined)
          matchedBy = el ? 'send button' : ''
        } else {
          if (!primary && fb.length === 0) {
            return {
              ok: true,
              data: {
                found: false,
                visible: false,
                clickable: false,
                matchedBy: '',
                tagName: '',
                text: '',
                triggered: null,
                message: 'Fail — কোনো selector সেট নেই',
              },
            }
          }
          const candidates = [primary, ...fb].map((s) => s.trim()).filter(Boolean)
          for (const sel of candidates) {
            const hit = querySmart(sel)
            if (hit) {
              el = promoteToClickHost(hit)
              matchedBy = sel
              break
            }
          }
          if (!el) {
            el = querySmartWithFallbacks(primary, fb)
            if (el) {
              el = promoteToClickHost(el)
              matchedBy = primary || fb[0] || ''
            }
          }
        }

        if (!el) {
          return {
            ok: true,
            data: {
              found: false,
              visible: false,
              clickable: false,
              matchedBy: '',
              tagName: '',
              text: '',
              triggered: null,
              message: 'Fail — page-এ element পাওয়া যায়নি',
            },
          }
        }

        const host = promoteToClickHost(el) as HTMLElement
        const visible = isElementVisible(host)
        const clickable = isElementClickable(host)
        const label = (host.innerText || host.textContent || host.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)

        let triggered: string | null = null
        let triggerError: string | undefined
        if (fireEvent && visible) {
          try {
            // Click/type/hover/… show border → 500ms → event inside their handlers.
            triggered = await triggerQuickTestEvent(host, actionId, command)
          } catch (error) {
            triggerError = error instanceof Error ? error.message : String(error)
          }
          // Non-interactive steps (wait/condition): still show the match highlight.
          if (triggered == null && !triggerError) {
            flashHighlight(host)
          }
        } else {
          flashHighlight(host)
        }

        const baseMsg = visible
          ? `OK — পাওয়া গেছে (${host.tagName.toLowerCase()}${clickable ? ', clickable' : ''}): “${label || matchedBy}”`
          : `Found but hidden — “${label || matchedBy}”`

        let message = baseMsg
        if (triggerError) {
          message = `${baseMsg} · Event fail: ${triggerError}`
        } else if (triggered) {
          message = `${baseMsg} · Event: ${triggered}`
        }

        return {
          ok: true,
          data: {
            found: true,
            visible,
            clickable,
            matchedBy,
            tagName: host.tagName.toLowerCase(),
            text: label,
            role: host.getAttribute('role') ?? '',
            triggered,
            triggerError,
            message,
          },
        }
      }
      case 'checkElementVisible': {
        if (!command.selector) throw new Error('selector is required')
        const timeoutMs = Math.max(0, Number(command.timeoutMs ?? 0))
        if (timeoutMs <= 0) {
          const el = findEl(command.selector, fb)
          return { ok: true, data: { visible: isElementVisible(el) } }
        }
        try {
          await waitForElementVisible(command.selector, timeoutMs, fb)
          return { ok: true, data: { visible: true } }
        } catch {
          return { ok: true, data: { visible: false } }
        }
      }
      case 'checkCondition': {
        const kind = String(command.options?.kind ?? 'element_visible')
        const timeoutMs = Math.max(0, Number(command.timeoutMs ?? 0))
        const text = String(command.text ?? '')
        const exact = Boolean(command.options?.exact)
        const matchMode = String(command.options?.matchMode ?? 'contains')
        const attribute = String(command.attribute ?? 'href')

        const evaluateOnce = (): {
          matched: boolean
          value?: string
          number?: number | null
          compare?: number
          operator?: string
        } => {
          if (kind === 'element_visible') {
            if (!command.selector) return { matched: false }
            return { matched: isElementVisible(findEl(command.selector, fb)) }
          }
          if (kind === 'element_exists') {
            if (!command.selector) return { matched: false }
            return { matched: Boolean(findEl(command.selector, fb)) }
          }
          if (kind === 'element_clickable') {
            if (!command.selector) return { matched: false }
            return { matched: isElementClickable(findEl(command.selector, fb)) }
          }
          if (kind === 'button_name') {
            if (command.selector) {
              return { matched: isElementClickable(findEl(command.selector, fb)) }
            }
            return { matched: Boolean(findButtonByLabel(text, exact)) }
          }
          if (kind === 'element_number') {
            if (!command.selector) return { matched: false, number: null }
            const el = findEl(command.selector, fb) as HTMLElement | null
            if (!el || !isElementVisible(el)) return { matched: false, number: null }
            const value = (
              el.innerText ||
              el.textContent ||
              el.getAttribute('aria-label') ||
              el.getAttribute('title') ||
              el.getAttribute('value') ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
            const number = extractNumberFromText(value)
            const compareRaw = String(
              command.options?.compareValue ?? command.value ?? '',
            ).trim()
            const compare = Number(compareRaw.replace(/,/g, ''))
            const operator = String(command.options?.operator ?? 'gt')
            if (number == null || !Number.isFinite(compare)) {
              return { matched: false, value, number, compare, operator }
            }
            return {
              matched: compareNumbers(number, operator, compare),
              value,
              number,
              compare,
              operator,
            }
          }
          if (kind === 'text_present') {
            return { matched: textMatches(pageTextBlob(), text, matchMode) }
          }
          if (kind === 'text_gone') {
            return { matched: !textMatches(pageTextBlob(), text, matchMode) }
          }
          if (kind === 'element_text') {
            if (!command.selector) return { matched: false, value: '' }
            const el = findEl(command.selector, fb) as HTMLElement | null
            const value = (el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim()
            return { matched: Boolean(el && isElementVisible(el)), value }
          }
          if (kind === 'element_attribute') {
            if (!command.selector) return { matched: false, value: '' }
            const el = findEl(command.selector, fb)
            const value = el?.getAttribute(attribute) ?? ''
            return { matched: Boolean(el), value }
          }
          return { matched: false }
        }

        if (timeoutMs <= 0) {
          return { ok: true, data: evaluateOnce() }
        }

        const started = Date.now()
        while (Date.now() - started <= timeoutMs) {
          const result = evaluateOnce()
          if (result.matched) return { ok: true, data: result }
          await new Promise((r) => window.setTimeout(r, 150))
        }

        return { ok: true, data: evaluateOnce() }
      }
      case 'getPageState': {
        return {
          ok: true,
          data: {
            url: location.href,
            title: document.title,
            readyState: document.readyState,
          },
        }
      }
      default:
        return { ok: false, error: `Unsupported action: ${command.action}` }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
