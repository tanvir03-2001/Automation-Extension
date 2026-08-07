const ROOT_ID = 'ae-run-guard-root'
const STYLE_ID = 'ae-run-guard-style'

/**
 * Block real user key presses only.
 * Pointer blocking is handled by the full-screen overlay (hit-testing).
 * Status UI is a tiny top-right Live badge — not a large banner.
 */
const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress'] as const

let locked = false
let listenersAttached = false
let bypassCount = 0

function isGuardUi(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(`#${ROOT_ID}`) || target.id === ROOT_ID)
}

function blockTrustedKeyboard(event: Event): void {
  if (!locked || bypassCount > 0) return
  if (!event.isTrusted) return
  if (isGuardUi(event.target)) return

  event.preventDefault()
  event.stopImmediatePropagation()
}

function ensureStyle(): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: auto;
      cursor: not-allowed;
      background: transparent;
      font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    }
    #${ROOT_ID}.ae-run-guard-bypass {
      pointer-events: none !important;
      cursor: default;
    }
    #${ROOT_ID}.ae-run-guard-bypass .ae-run-guard-badge {
      pointer-events: none !important;
      opacity: 0.7;
    }
    #${ROOT_ID} .ae-run-guard-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 10px 6px 8px;
      border-radius: 999px;
      border: 1px solid rgba(248, 113, 113, 0.45);
      background: rgba(15, 23, 42, 0.72);
      color: #fecaca;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: auto;
      cursor: pointer;
      user-select: none;
    }
    #${ROOT_ID} .ae-run-guard-badge:hover {
      background: rgba(15, 23, 42, 0.88);
      border-color: rgba(248, 113, 113, 0.7);
    }
    #${ROOT_ID} .ae-run-guard-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #ef4444;
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
      animation: ae-run-guard-blink 1.1s ease-out infinite;
      flex-shrink: 0;
    }
    #${ROOT_ID} .ae-run-guard-live {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fee2e2;
      line-height: 1;
    }
    @keyframes ae-run-guard-blink {
      0% {
        opacity: 1;
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.65);
        transform: scale(1);
      }
      55% {
        opacity: 0.35;
        box-shadow: 0 0 0 7px rgba(239, 68, 68, 0);
        transform: scale(0.92);
      }
      100% {
        opacity: 1;
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        transform: scale(1);
      }
    }
  `
  document.documentElement.appendChild(style)
}

function ensureRoot(): HTMLElement {
  ensureStyle()
  let root = document.getElementById(ROOT_ID)
  if (root) {
    // Upgrade old banner UI if still present
    if (!root.querySelector('.ae-run-guard-badge')) {
      root.innerHTML = `
        <div class="ae-run-guard-badge" role="status" aria-live="polite" title="Automation live — click to pause · Esc to unlock">
          <span class="ae-run-guard-dot" aria-hidden="true"></span>
          <span class="ae-run-guard-live">Live</span>
        </div>
      `
      bindBadge(root)
    }
    return root
  }

  root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('data-ae-run-guard', 'true')
  root.innerHTML = `
    <div class="ae-run-guard-badge" role="status" aria-live="polite" title="Automation live — click to pause · Esc to unlock">
      <span class="ae-run-guard-dot" aria-hidden="true"></span>
      <span class="ae-run-guard-live">Live</span>
    </div>
  `

  bindBadge(root)

  for (const type of [
    'click',
    'dblclick',
    'auxclick',
    'contextmenu',
    'mousedown',
    'mouseup',
    'mousemove',
    'pointerdown',
    'pointerup',
    'pointermove',
    'touchstart',
    'touchend',
    'touchmove',
    'wheel',
    'dragstart',
    'drop',
  ]) {
    root.addEventListener(
      type,
      (event) => {
        if (bypassCount > 0) return
        if (!(event.target instanceof Element)) return
        if (event.target.closest('.ae-run-guard-badge')) return
        event.preventDefault()
        event.stopPropagation()
      },
      true,
    )
  }

  document.documentElement.appendChild(root)
  return root
}

function bindBadge(root: HTMLElement): void {
  const badge = root.querySelector('.ae-run-guard-badge')
  if (!badge || badge.getAttribute('data-ae-bound') === '1') return
  badge.setAttribute('data-ae-bound', '1')
  badge.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void chrome.runtime.sendMessage({ type: 'PLANNER_PAUSE' })
  })
}

function attachListeners(): void {
  if (listenersAttached) return
  for (const type of KEYBOARD_EVENTS) {
    window.addEventListener(type, blockTrustedKeyboard, true)
    document.addEventListener(type, blockTrustedKeyboard, true)
  }
  window.addEventListener('keydown', onEscapePause, true)
  listenersAttached = true
}

function detachListeners(): void {
  if (!listenersAttached) return
  for (const type of KEYBOARD_EVENTS) {
    window.removeEventListener(type, blockTrustedKeyboard, true)
    document.removeEventListener(type, blockTrustedKeyboard, true)
  }
  window.removeEventListener('keydown', onEscapePause, true)
  listenersAttached = false
}

function onEscapePause(event: KeyboardEvent): void {
  if (!locked || bypassCount > 0 || !event.isTrusted) return
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  void chrome.runtime.sendMessage({ type: 'PLANNER_PAUSE' })
}

function setBypassVisual(active: boolean): void {
  const root = document.getElementById(ROOT_ID)
  if (!root) return
  root.classList.toggle('ae-run-guard-bypass', active)
}

/**
 * Temporarily lift the lock overlay so automation can focus/click/paste
 * into the real page (ChatGPT composer, etc.).
 */
export async function withGuardBypass<T>(fn: () => Promise<T> | T): Promise<T> {
  bypassCount += 1
  setBypassVisual(true)
  try {
    return await fn()
  } finally {
    bypassCount = Math.max(0, bypassCount - 1)
    if (bypassCount === 0 && locked) setBypassVisual(false)
  }
}

export function lockRunGuard(_message?: string): { ok: true; locked: true } {
  locked = true
  attachListeners()
  const root = ensureRoot()
  if (bypassCount === 0) root.classList.remove('ae-run-guard-bypass')
  return { ok: true, locked: true }
}

export function unlockRunGuard(): { ok: true; locked: false } {
  locked = false
  bypassCount = 0
  detachListeners()
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
  return { ok: true, locked: false }
}

export function isRunGuardLocked(): boolean {
  return locked
}

export function refreshRunGuard(): { ok: true; locked: boolean } {
  if (!locked) return { ok: true, locked: false }
  ensureRoot()
  attachListeners()
  if (bypassCount > 0) setBypassVisual(true)
  return { ok: true, locked: true }
}
