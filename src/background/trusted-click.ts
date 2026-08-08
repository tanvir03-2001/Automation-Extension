/**
 * Real (trusted) mouse click via Chrome DevTools Protocol.
 * DeepSeek / many React apps ignore synthetic content-script clicks (isTrusted=false).
 *
 * While an automation session is active (Start → End), the debugger stays attached
 * so Chrome shows the “started debugging” infobar for the whole run.
 */

const attached = new Set<number>()
let sessionActive = false

const NON_DEBUGGABLE = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false
  return NON_DEBUGGABLE.some((prefix) => url.startsWith(prefix))
}

/** Keep CDP attached for the whole planner/workflow run. */
export function setTrustedClickSession(active: boolean): void {
  sessionActive = active
  if (!active) {
    void detachAllTrustedClicks()
  }
}

export function isTrustedClickSessionActive(): boolean {
  return sessionActive
}

export async function ensureTrustedClickAttached(tabId: number): Promise<void> {
  const ok = await attachTrustedDebugger(tabId)
  if (!ok) {
    throw new Error(`Could not attach debugger to tab ${tabId}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Attach CDP; returns false if tab is restricted / attach failed (does not throw).
 * Retries while the tab URL is still empty (new tab loading).
 */
export async function attachTrustedDebugger(tabId: number): Promise<boolean> {
  if (attached.has(tabId)) return true

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const tab = await chrome.tabs.get(tabId)
      const url = tab.url ?? ''

      if (isRestrictedUrl(url)) {
        return false
      }

      // Empty URL = still loading — wait and retry
      if (!url && tab.status === 'loading') {
        await sleep(150)
        continue
      }

      await chrome.debugger.attach({ tabId }, '1.3')
      attached.add(tabId)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/already attached/i.test(message)) {
        attached.add(tabId)
        return true
      }
      // Transient: tab not ready yet
      if (/no tab|cannot access|not found|detached/i.test(message) && attempt < 7) {
        await sleep(150)
        continue
      }
      console.warn('[trusted-click] debugger.attach failed', tabId, message)
      if (attempt < 7) {
        await sleep(150)
        continue
      }
      return false
    }
  }
  return false
}

export async function detachTrustedClick(tabId: number): Promise<void> {
  if (!attached.has(tabId)) return
  attached.delete(tabId)
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    /* ignore */
  }
}

export async function detachAllTrustedClicks(): Promise<void> {
  await Promise.all([...attached].map((tabId) => detachTrustedClick(tabId)))
}

/** Pick any normal http(s) / about:blank tab suitable for debugger attach. */
export async function findDebuggableTabId(
  preferredTabId?: number | null,
): Promise<number | undefined> {
  if (preferredTabId != null) {
    try {
      const tab = await chrome.tabs.get(preferredTabId)
      if (tab.id != null && !isRestrictedUrl(tab.url)) return tab.id
    } catch {
      /* gone */
    }
  }

  try {
    const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (focused?.id != null && !isRestrictedUrl(focused.url)) return focused.id
  } catch {
    /* ignore */
  }

  const tabs = await chrome.tabs.query({})
  const web = tabs.find(
    (tab) =>
      tab.id != null &&
      typeof tab.url === 'string' &&
      (tab.url.startsWith('http://') ||
        tab.url.startsWith('https://') ||
        tab.url === 'about:blank'),
  )
  return web?.id
}

/** Click via page MAIN world — used when CDP did not produce a page effect. */
async function mainWorldClickAt(tabId: number, x: number, y: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [Math.round(x), Math.round(y)],
      func: (cx: number, cy: number) => {
        const hit = document.elementFromPoint(cx, cy)
        if (!(hit instanceof Element)) return false

        const CLICK_HOST =
          'button, [role="button"], [role="combobox"], [role="listbox"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [data-slot="select-trigger"], [data-slot="dropdown-menu-trigger"], .ds-button, [class*="ds-button"], a[href], a[aria-label]'

        const resolveHost = (from: Element): HTMLElement | null => {
          const start = from instanceof HTMLElement ? from : from.parentElement
          if (!start) return null
          if (start.matches(CLICK_HOST)) return start
          const ancestor = start.closest<HTMLElement>(CLICK_HOST)
          if (ancestor) return ancestor
          // tooltip-trigger / tabindex wrapper → inner combobox/select
          let cur: HTMLElement | null = start
          for (let i = 0; i < 5 && cur; i += 1) {
            const nested = cur.querySelector<HTMLElement>(CLICK_HOST)
            if (nested) return nested
            cur = cur.parentElement
          }
          return start
        }

        const host = resolveHost(hit)
        if (!host) return false

        host.focus?.({ preventScroll: true })

        const common: MouseEventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: cx,
          clientY: cy,
          screenX: cx,
          screenY: cy,
          button: 0,
          buttons: 1,
          detail: 1,
        }
        host.dispatchEvent(
          new PointerEvent('pointerdown', {
            ...common,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          }),
        )
        host.dispatchEvent(new MouseEvent('mousedown', common))
        host.dispatchEvent(
          new PointerEvent('pointerup', {
            ...common,
            buttons: 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          }),
        )
        host.dispatchEvent(new MouseEvent('mouseup', { ...common, buttons: 0 }))
        // One click only here — content script may still try native activate if no effect
        host.dispatchEvent(new MouseEvent('click', { ...common, buttons: 0 }))
        return true
      },
    })
    return Boolean(results?.[0]?.result)
  } catch {
    return false
  }
}

async function cdpClickAt(tabId: number, x: number, y: number): Promise<void> {
  const ok = await attachTrustedDebugger(tabId)
  if (!ok) throw new Error('Debugger not attached for CDP click')
  const target = { tabId }
  const common = {
    x: Math.round(x),
    y: Math.round(y),
    button: 'left' as const,
    clickCount: 1,
    buttons: 1,
    pointerType: 'mouse' as const,
  }

  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...common,
    buttons: 0,
  })
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...common,
  })
  await new Promise((r) => setTimeout(r, 45))
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...common,
    buttons: 0,
  })
}

function cdpKeyParts(key: string): {
  key: string
  code: string
  windowsVirtualKeyCode: number
  text?: string
} {
  const special: Record<
    string,
    { key: string; code: string; windowsVirtualKeyCode: number; text?: string }
  > = {
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    ' ': { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
    Insert: { key: 'Insert', code: 'Insert', windowsVirtualKeyCode: 45 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
    Home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
    End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
    PageUp: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
    PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
    Control: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
    Alt: { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 },
    Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
    Meta: { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 },
  }
  if (special[key]) return special[key]
  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    const n = Number(key.slice(1))
    return { key: `F${n}`, code: `F${n}`, windowsVirtualKeyCode: 111 + n }
  }
  if (/^[A-Z]$/.test(key)) {
    return {
      key: key.toLowerCase(),
      code: `Key${key}`,
      windowsVirtualKeyCode: key.charCodeAt(0),
      text: key.toLowerCase(),
    }
  }
  if (/^[0-9]$/.test(key)) {
    return {
      key,
      code: `Digit${key}`,
      windowsVirtualKeyCode: 48 + Number(key),
      text: key,
    }
  }
  return {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    text: key.length === 1 ? key : undefined,
  }
}

function cdpModifiers(keys: string[]): number {
  // CDP: Alt=1, Ctrl=2, Meta=4, Shift=8
  let mods = 0
  if (keys.includes('Alt')) mods |= 1
  if (keys.includes('Control')) mods |= 2
  if (keys.includes('Meta')) mods |= 4
  if (keys.includes('Shift')) mods |= 8
  return mods
}

/** Trusted key chord via CDP (e.g. Enter, Control+Enter). */
export async function trustedKeyChord(
  tabId: number,
  keys: string[],
): Promise<{ ok: boolean; error?: string }> {
  const chord = keys.map((k) => String(k)).filter(Boolean)
  if (chord.length === 0) return { ok: false, error: 'No keys to press' }

  try {
    const ok = await attachTrustedDebugger(tabId)
    if (!ok) throw new Error('Debugger not attached for key press')
    const target = { tabId }
    const modifiers = cdpModifiers(chord)
    const modSet = new Set(['Control', 'Alt', 'Shift', 'Meta'])
    const ordered = [
      ...['Control', 'Alt', 'Shift', 'Meta'].filter((m) => chord.includes(m)),
      ...chord.filter((k) => !modSet.has(k)),
    ]

    for (const key of ordered) {
      const parts = cdpKeyParts(key)
      const isMod = modSet.has(key)
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        modifiers: isMod ? cdpModifiers(ordered.slice(0, ordered.indexOf(key) + 1)) : modifiers,
        key: parts.key,
        code: parts.code,
        windowsVirtualKeyCode: parts.windowsVirtualKeyCode,
        nativeVirtualKeyCode: parts.windowsVirtualKeyCode,
      })
      if (!isMod && parts.text) {
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'char',
          modifiers,
          text: parts.text,
          key: parts.key,
          code: parts.code,
          windowsVirtualKeyCode: parts.windowsVirtualKeyCode,
          nativeVirtualKeyCode: parts.windowsVirtualKeyCode,
        })
      }
      await new Promise((r) => setTimeout(r, 25))
    }

    for (const key of [...ordered].reverse()) {
      const parts = cdpKeyParts(key)
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers,
        key: parts.key,
        code: parts.code,
        windowsVirtualKeyCode: parts.windowsVirtualKeyCode,
        nativeVirtualKeyCode: parts.windowsVirtualKeyCode,
      })
      await new Promise((r) => setTimeout(r, 15))
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (!sessionActive) {
      await detachTrustedClick(tabId)
    }
  }
}

export async function trustedClickAt(
  tabId: number,
  x: number,
  y: number,
  options?: { mode?: 'cdp' | 'main' | 'auto' },
): Promise<{ ok: boolean; error?: string }> {
  const mode = options?.mode ?? 'auto'
  try {
    if (mode === 'main') {
      const ok = await mainWorldClickAt(tabId, x, y)
      return ok ? { ok: true } : { ok: false, error: 'MAIN-world click missed target' }
    }

    if (mode === 'cdp') {
      await cdpClickAt(tabId, x, y)
      return { ok: true }
    }

    // auto: CDP first. Content script decides whether a MAIN fallback is needed
    // (effect-aware) so menus are not double-toggled.
    try {
      await cdpClickAt(tabId, x, y)
      return { ok: true }
    } catch (cdpError) {
      const ok = await mainWorldClickAt(tabId, x, y)
      if (ok) return { ok: true }
      return {
        ok: false,
        error: cdpError instanceof Error ? cdpError.message : String(cdpError),
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (!sessionActive) {
      await detachTrustedClick(tabId)
    }
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attached.delete(source.tabId)
})
