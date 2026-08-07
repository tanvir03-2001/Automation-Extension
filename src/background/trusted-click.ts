/**
 * Real (trusted) mouse click via Chrome DevTools Protocol.
 * DeepSeek / many React apps ignore synthetic content-script clicks (isTrusted=false).
 *
 * Detaches immediately after each click so the Chrome debug infobar does not linger.
 */

const attached = new Set<number>()

async function ensureAttached(tabId: number): Promise<void> {
  if (attached.has(tabId)) return
  try {
    await chrome.debugger.attach({ tabId }, '1.3')
    attached.add(tabId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already attached/i.test(message)) {
      attached.add(tabId)
      return
    }
    throw error
  }
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
          hit.closest<HTMLElement>('button, [role="button"], .ds-button, [class*="ds-button"], a[href]') ||
          (hit instanceof HTMLElement ? hit : hit.parentElement)
        if (!host) return false

        const invokeReact = (el: HTMLElement): boolean => {
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
                      clientX: cx,
                      clientY: cy,
                      nativeEvent: new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }),
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

        host.focus?.({ preventScroll: true })
        invokeReact(host)

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
        host.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
        host.dispatchEvent(new MouseEvent('mousedown', common))
        host.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }))
        host.dispatchEvent(new MouseEvent('mouseup', { ...common, buttons: 0 }))
        host.dispatchEvent(new MouseEvent('click', { ...common, buttons: 0 }))
        host.click()
        return true
      },
    })
    return Boolean(results?.[0]?.result)
  } catch {
    return false
  }
}

async function cdpClickAt(tabId: number, x: number, y: number): Promise<void> {
  await ensureAttached(tabId)
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
    await mainWorldClickAt(tabId, x, y)
    // CDP is the reliable path for sites that require isTrusted === true
    await cdpClickAt(tabId, x, y)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    // Drop debugger ASAP so the Chrome infobar does not stay for the whole run
    await detachTrustedClick(tabId)
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attached.delete(source.tabId)
})
