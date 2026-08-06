import {
  buildSmartPick,
  resolveInteractiveTarget,
  type SmartPickResult,
} from '@/engine/automation/smart-selector'

export type PickedElement = SmartPickResult

function isPickerUi(el: Element | null): boolean {
  if (!el) return false
  return Boolean(
    el.closest('#ae-element-picker-root') ||
      el.id === 'ae-element-picker-root' ||
      el.id === 'ae-element-picker-highlight' ||
      el.id === 'ae-element-picker-banner',
  )
}

export function startElementPicker(): Promise<PickedElement> {
  return new Promise((resolve, reject) => {
    document.getElementById('ae-element-picker-root')?.remove()

    const root = document.createElement('div')
    root.id = 'ae-element-picker-root'

    const highlight = document.createElement('div')
    highlight.id = 'ae-element-picker-highlight'
    Object.assign(highlight.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      border: '3px solid #14b8a6',
      background: 'rgba(20, 184, 166, 0.18)',
      borderRadius: '6px',
      boxShadow: '0 0 0 2px rgba(15, 23, 42, 0.35)',
      transition: 'top 40ms linear, left 40ms linear, width 40ms linear, height 40ms linear',
      display: 'none',
    })

    const banner = document.createElement('div')
    banner.id = 'ae-element-picker-banner'
    banner.textContent =
      'Automation Engine · Hover button/icon · Click to select (text/SVG tracked) · Esc cancel'
    Object.assign(banner.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#0f172a',
      color: '#f8fafc',
      padding: '10px 16px',
      borderRadius: '999px',
      font: '600 13px/1.3 Segoe UI, sans-serif',
      boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      pointerEvents: 'none',
      border: '1px solid rgba(20, 184, 166, 0.55)',
    })

    root.append(highlight, banner)
    document.documentElement.append(root)

    let lastTarget: Element | null = null

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      root.remove()
    }

    const paintHighlight = (target: Element) => {
      const rect = target.getBoundingClientRect()
      Object.assign(highlight.style, {
        display: 'block',
        top: `${Math.max(0, rect.top)}px`,
        left: `${Math.max(0, rect.left)}px`,
        width: `${Math.max(0, rect.width)}px`,
        height: `${Math.max(0, rect.height)}px`,
      })
    }

    const onMouseMove = (event: MouseEvent) => {
      const raw = document.elementFromPoint(event.clientX, event.clientY)
      if (!raw || isPickerUi(raw)) return
      const target = resolveInteractiveTarget(raw)
      if (target === lastTarget) return
      lastTarget = target
      paintHighlight(target)
    }

    const onClick = (event: MouseEvent) => {
      const raw = document.elementFromPoint(event.clientX, event.clientY)
      if (!raw || isPickerUi(raw)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const picked = buildSmartPick(raw)
      cleanup()
      resolve(picked)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cleanup()
      reject(new Error('Element pick cancelled'))
    }

    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
  })
}
