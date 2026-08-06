const ROOT_ID = 'ae-run-guard-root'
const STYLE_ID = 'ae-run-guard-style'

/**
 * Block real user key presses only.
 * Do NOT block input/beforeinput/paste — Chrome marks execCommand('insertText')
 * events as isTrusted, and those must reach ChatGPT/ProseMirror for Type/Paste.
 * Pointer blocking is handled by the full-screen overlay (hit-testing).
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
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: auto;
      cursor: not-allowed;
      background:
        linear-gradient(180deg, rgba(8, 18, 28, 0.18), rgba(8, 18, 28, 0.08));
      font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    }
    #${ROOT_ID}.ae-run-guard-bypass {
      pointer-events: none !important;
      cursor: default;
      background: transparent;
    }
    #${ROOT_ID}.ae-run-guard-bypass .ae-run-guard-banner {
      pointer-events: none !important;
      opacity: 0.55;
    }
    #${ROOT_ID} .ae-run-guard-banner {
      position: absolute;
      left: 50%;
      top: 16px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: min(520px, calc(100vw - 24px));
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(16, 185, 129, 0.45);
      background: rgba(15, 23, 42, 0.92);
      color: #ecfdf5;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      pointer-events: auto;
      cursor: default;
    }
    #${ROOT_ID} .ae-run-guard-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #34d399;
      box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
      animation: ae-run-guard-pulse 1.4s ease-out infinite;
      flex-shrink: 0;
    }
    #${ROOT_ID} .ae-run-guard-text {
      font-size: 12px;
      line-height: 1.35;
      font-weight: 600;
    }
    #${ROOT_ID} .ae-run-guard-text span {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      font-weight: 500;
      color: rgba(236, 253, 245, 0.72);
    }
    #${ROOT_ID} .ae-run-guard-btn {
      margin-left: 4px;
      border: 1px solid rgba(248, 250, 252, 0.2);
      background: rgba(248, 250, 252, 0.08);
      color: #f8fafc;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    #${ROOT_ID} .ae-run-guard-btn:hover {
      background: rgba(248, 250, 252, 0.16);
    }
    @keyframes ae-run-guard-pulse {
      0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55); }
      70% { box-shadow: 0 0 0 10px rgba(52, 211, 153, 0); }
      100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    }
  `
  document.documentElement.appendChild(style)
}

function ensureRoot(): HTMLElement {
  ensureStyle()
  let root = document.getElementById(ROOT_ID)
  if (root) return root

  root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('data-ae-run-guard', 'true')
  root.innerHTML = `
    <div class="ae-run-guard-banner" role="status" aria-live="polite">
      <div class="ae-run-guard-dot"></div>
      <div class="ae-run-guard-text">
        Automation running — page input locked
        <span>Your mouse &amp; keyboard won’t affect this tab. Esc or Pause to unlock.</span>
      </div>
      <button type="button" class="ae-run-guard-btn" data-ae-guard-pause>Pause</button>
    </div>
  `

  root.querySelector('[data-ae-guard-pause]')?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void chrome.runtime.sendMessage({ type: 'PLANNER_PAUSE' })
  })

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
        if (event.target.closest('[data-ae-guard-pause]')) return
        event.preventDefault()
        event.stopPropagation()
      },
      true,
    )
  }

  document.documentElement.appendChild(root)
  return root
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

export function lockRunGuard(message?: string): { ok: true; locked: true } {
  locked = true
  attachListeners()
  const root = ensureRoot()
  if (bypassCount === 0) root.classList.remove('ae-run-guard-bypass')
  const label = root.querySelector('.ae-run-guard-text')
  if (label && message) {
    label.innerHTML = `${message}<span>Your mouse &amp; keyboard won’t affect this tab. Esc or Pause to unlock.</span>`
  }
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
