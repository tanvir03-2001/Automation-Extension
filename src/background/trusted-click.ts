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

/** Click via page MAIN world (React props + .click) — no debugger bar. */
async function mainWorldClickAt(tabId: number, x: number, y: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [Math.round(x), Math.round(y)],
      func: (cx: number, cy: number) => {
        const hit = document.elementFromPoint(cx, cy)
        if (!(hit instanceof Element)) return false

        const host =
          hit.closest<HTMLElement>(
            'button, [role="button"], [role="menuitem"], [role="option"], .ds-button, [class*="ds-button"], a[href]',
          ) || (hit instanceof HTMLElement ? hit : hit.parentElement)
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

export async function trustedClickAt(
  tabId: number,
  x: number,
  y: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // One click only. Stacking MAIN-world + CDP toggles menus open→close
    // (profile / logout / dropdowns) and can leave body scroll locked.
    try {
      await cdpClickAt(tabId, x, y)
      return { ok: true }
    } catch (cdpError) {
      const ok = await mainWorldClickAt(tabId, x, y)
      if (ok) return { ok: true }
      return {
        ok: false,
        error:
          cdpError instanceof Error ? cdpError.message : String(cdpError),
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
