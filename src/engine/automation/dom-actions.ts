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

function findButtonByLabel(label: string, exact: boolean): HTMLElement | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a',
    ),
  )
  return (
    candidates.find((el) => {
      if (!isElementVisible(el)) return false
      const text = (
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
      return exact ? text === needle : text.includes(needle)
    }) ?? null
  )
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

function flashHighlight(el: HTMLElement): void {
  const prevOutline = el.style.outline
  const prevOffset = el.style.outlineOffset
  const prevShadow = el.style.boxShadow
  const prevTransition = el.style.transition
  el.style.transition = 'outline 0.15s ease, box-shadow 0.15s ease'
  el.style.outline = '3px solid #14b8a6'
  el.style.outlineOffset = '3px'
  el.style.boxShadow = '0 0 0 6px rgba(20,184,166,0.28)'
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  window.setTimeout(() => {
    el.style.outline = prevOutline
    el.style.outlineOffset = prevOffset
    el.style.boxShadow = prevShadow
    el.style.transition = prevTransition
  }, 1600)
}

/** DeepSeek / React: click the role=button host, not inner span/background. */
async function robustClick(el: HTMLElement): Promise<void> {
  const clickTarget = promoteToClickHost(el)
  clickTarget.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'instant' as ScrollBehavior,
  })
  await sleep(100)

  const rect = clickTarget.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  try {
    clickTarget.focus({ preventScroll: true })
  } catch {
    /* ignore */
  }

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
  clickTarget.dispatchEvent(
    new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }),
  )
  clickTarget.dispatchEvent(new MouseEvent('mouseup', { ...mouseInit, buttons: 0 }))
  clickTarget.dispatchEvent(new MouseEvent('click', { ...mouseInit, buttons: 0 }))
  clickTarget.click()

  // DeepSeek ds-button (role=button tabindex=0) also activates via Enter
  if (
    clickTarget.getAttribute('role') === 'button' ||
    clickTarget.className.toString().includes('ds-button')
  ) {
    await sleep(40)
    const keyInit: KeyboardEventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    }
    clickTarget.dispatchEvent(new KeyboardEvent('keydown', keyInit))
    clickTarget.dispatchEvent(new KeyboardEvent('keyup', keyInit))
  }

  await sleep(150)
}

async function clickChatSend(selector?: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const btn = findSendButton(selector)
    if (btn && isSendButtonReady(selector)) {
      await robustClick(btn)
      return
    }
    await sleep(200)
  }

  // Fallback: Enter in composer (ChatGPT often sends on Enter)
  const composer = findChatComposer()
  if (composer) {
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
        const el = await waitForElement(command.selector, command.timeoutMs, fb)
        await robustClick(el as HTMLElement)
        return { ok: true }
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
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: command.key ?? 'Enter',
            bubbles: true,
          }),
        )
        target.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: command.key ?? 'Enter',
            bubbles: true,
          }),
        )
        return { ok: true }
      }
      case 'scroll': {
        if (command.selector) {
          const el = await waitForElement(command.selector, command.timeoutMs, fb)
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
              message: present
                ? `OK — page-এ “${textHint}” পাওয়া গেছে`
                : `Fail — page-এ “${textHint}” নেই`,
            },
          }
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

        flashHighlight(host)

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
            message: visible
              ? `OK — পাওয়া গেছে (${host.tagName.toLowerCase()}${clickable ? ', clickable' : ''}): “${label || matchedBy}”`
              : `Found but hidden — “${label || matchedBy}”`,
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

        const evaluateOnce = (): { matched: boolean; value?: string } => {
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
