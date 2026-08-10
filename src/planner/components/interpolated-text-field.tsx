import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  applyCompletion,
  buildCompletionScope,
  completePath,
  findActiveTemplate,
  type CompletionRoot,
  type CompletionSuggestion,
  type JsonValueKind,
} from '@/planner/engine/template-completion'
import { resolveLoopScope } from '@/planner/engine/loop-scope'
import { usePlannerStore } from '@/planner/store/planner-store'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'

export function useTemplateCompletionScope(
  workflowId: string | null | undefined,
  nodeId: string | null | undefined,
): CompletionRoot[] {
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === workflow?.planId))

  return useMemo(() => {
    const loopScope =
      workflow && nodeId ? resolveLoopScope(workflow, nodeId, plan) : { kind: 'outside' as const }
    return buildCompletionScope({
      datasets: plan?.datasets ?? [],
      loopScope,
    })
  }, [workflow, nodeId, plan])
}

type InterpolatedTextFieldProps = {
  value: string
  onChange: (value: string) => void
  scope: CompletionRoot[]
  multiline?: boolean
  className?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  rows?: number
}

const KIND_LABEL: Record<JsonValueKind, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
  array: 'array',
  object: 'object',
  undefined: 'unknown',
}

export function InterpolatedTextField({
  value,
  onChange,
  scope,
  multiline = false,
  className,
  placeholder,
  disabled,
  id,
  rows = 4,
}: InterpolatedTextFieldProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )
  const activeRef = useRef(findActiveTemplate(value, value.length))

  const refreshFromCaret = useCallback(
    (text: string = value) => {
      const el = inputRef.current
      if (!el) return
      const cursor = el.selectionStart ?? 0
      const active = findActiveTemplate(text, cursor)
      activeRef.current = active
      if (!active) {
        setOpen(false)
        setSuggestions([])
        return
      }
      const next = completePath(scope, active.pathBeforeCaret)
      setSuggestions(next)
      setActiveIndex(0)
      setOpen(true)
    },
    [scope, value],
  )

  const updatePopupPosition = useCallback(() => {
    const el = inputRef.current
    if (!el || !open) {
      setPopupPos(null)
      return
    }
    const rect = el.getBoundingClientRect()
    const caret = getCaretCoordinates(el, el.selectionStart ?? 0)
    const top = rect.top + caret.top - 8
    const left = Math.min(
      rect.left + caret.left,
      window.innerWidth - 280,
    )
    setPopupPos({
      top: Math.max(8, top),
      left: Math.max(8, left),
      width: Math.min(280, rect.width),
    })
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    updatePopupPosition()
  }, [open, suggestions, value, updatePopupPosition])

  useEffect(() => {
    if (!open) return
    const onScroll = () => updatePopupPosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updatePopupPosition])

  const applySuggestion = useCallback(
    (suggestion: CompletionSuggestion) => {
      const el = inputRef.current
      if (!el) return
      const cursor = el.selectionStart ?? 0
      const active = findActiveTemplate(value, cursor) ?? activeRef.current
      if (!active) return
      // Insert path only — user types `.` manually to drill into nested suggestions.
      const { value: next, caret } = applyCompletion(value, active, suggestion.insertText)
      onChange(next)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(caret, caret)
        setOpen(false)
        setSuggestions([])
      })
    },
    [onChange, value],
  )

  function handleSelect() {
    refreshFromCaret()
  }

  function handleChange(event: { target: HTMLInputElement | HTMLTextAreaElement }) {
    const next = event.target.value
    onChange(next)
    requestAnimationFrame(() => refreshFromCaret(next))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === 'Escape') setOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const suggestion = suggestions[activeIndex]
      if (suggestion) applySuggestion(suggestion)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const sharedClass = cn(
    multiline
      ? 'min-h-24 w-full max-w-full resize-y break-words rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2'
      : 'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )

  const popup =
    open && popupPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popupRef}
            role="listbox"
            className="z-[9999] max-h-56 overflow-auto rounded-xl border border-border bg-card p-1 text-card-foreground shadow-lg"
            style={
              {
                position: 'fixed',
                top: popupPos.top,
                left: popupPos.left,
                width: popupPos.width,
                transform: 'translateY(-100%)',
                backgroundColor: 'hsl(var(--card))',
              } satisfies CSSProperties
            }
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestions.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {t('template.noVariables')}
              </p>
            ) : (
              suggestions.map((item, index) => (
                <button
                  key={`${item.insertText}:${item.key}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
                    index === activeIndex ? 'bg-muted' : 'hover:bg-muted/70',
                  )}
                  title={item.preview}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => applySuggestion(item)}
                >
                  <span className="min-w-0 flex-1 truncate font-mono font-medium text-foreground">
                    {item.key}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[item.kind]}
                  </span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative w-full">
      {multiline ? (
        <textarea
          ref={inputRef as RefObject<HTMLTextAreaElement>}
          id={id}
          rows={rows}
          disabled={disabled}
          className={sharedClass}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleSelect}
          onKeyUp={handleSelect}
          onSelect={handleSelect}
        />
      ) : (
        <input
          ref={inputRef as RefObject<HTMLInputElement>}
          id={id}
          type="text"
          disabled={disabled}
          className={sharedClass}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleSelect}
          onKeyUp={handleSelect}
          onSelect={handleSelect}
        />
      )}
      {popup}
    </div>
  )
}

/** Approximate caret offset inside an input/textarea for popup anchoring. */
function getCaretCoordinates(
  element: HTMLInputElement | HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  if (element instanceof HTMLInputElement) {
    // Single-line: estimate with a mirror span
    const style = window.getComputedStyle(element)
    const mirror = document.createElement('div')
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre'
    mirror.style.font = style.font
    mirror.style.letterSpacing = style.letterSpacing
    mirror.textContent = element.value.slice(0, position)
    document.body.appendChild(mirror)
    const width = mirror.offsetWidth
    document.body.removeChild(mirror)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    return {
      top: element.offsetHeight,
      left: paddingLeft + width - element.scrollLeft,
    }
  }

  const style = window.getComputedStyle(element)
  const div = document.createElement('div')
  const properties = [
    'direction',
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'MozTabSize',
  ] as const

  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.wordWrap = 'break-word'
  for (const prop of properties) {
    div.style.setProperty(prop, style.getPropertyValue(prop))
  }
  div.style.width = `${element.clientWidth}px`

  const text = element.value.slice(0, position)
  div.textContent = text
  const span = document.createElement('span')
  span.textContent = element.value.slice(position) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const coordinates = {
    top: span.offsetTop - element.scrollTop + parseFloat(style.borderTopWidth || '0'),
    left: span.offsetLeft - element.scrollLeft,
  }
  document.body.removeChild(div)
  return coordinates
}
