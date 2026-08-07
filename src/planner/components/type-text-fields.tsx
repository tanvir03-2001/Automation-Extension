import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, RotateCcw } from 'lucide-react'
import {
  applyTextTemplate,
  getQueueCursor,
  libraryPlaceholder,
  resetQueueCursor,
} from '@/planner/engine/text-library'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/cn'

interface TypeTextFieldsProps {
  workflowId: string
  nodeId: string
  params: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
  /** type = human typing · paste = insert full text instantly */
  variant?: 'type' | 'paste'
}

export function TypeTextFields({
  workflowId,
  nodeId,
  params,
  onChange,
  variant = 'type',
}: TypeTextFieldsProps) {
  const isPaste = variant === 'paste'
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === workflow?.planId))
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)

  const libraries = plan?.textLibraries ?? []
  const mode = String(params.textMode ?? 'manual')
  const libraryId = String(params.textLibraryId ?? '')
  const selectedLibrary = libraries.find((lib) => lib.id === libraryId) ?? null
  const textTemplate = String(params.textTemplate ?? '')

  const selectedIds = useMemo(() => {
    const raw = params.textItemIds
    if (raw === 'all' || raw === undefined || raw === null) {
      return new Set(selectedLibrary?.items.map((item) => item.id) ?? [])
    }
    if (!Array.isArray(raw)) return new Set<string>()
    return new Set(raw.map(String))
  }, [params.textItemIds, selectedLibrary])

  const allSelected =
    !!selectedLibrary &&
    selectedLibrary.items.length > 0 &&
    selectedLibrary.items.every((item) => selectedIds.has(item.id))

  const [queuePreview, setQueuePreview] = useState('')
  const [nextTitle, setNextTitle] = useState('')

  const queueKey = useMemo(() => {
    if (!selectedLibrary) return ''
    const ids = selectedLibrary.items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => item.id)
    return `lib:${selectedLibrary.id}:${ids.join(',')}`
  }, [selectedLibrary, selectedIds])

  async function refreshPreview() {
    if (!selectedLibrary || !queueKey) {
      setQueuePreview('')
      setNextTitle('')
      return
    }
    const items = selectedLibrary.items.filter((item) => selectedIds.has(item.id))
    if (!items.length) {
      setQueuePreview('Select at least one title')
      setNextTitle('')
      return
    }
    if (items.length === 1) {
      setNextTitle(items[0]!.title)
      setQueuePreview(`Always: ${items[0]!.title}`)
      return
    }
    const index = await getQueueCursor(workflowId, nodeId, queueKey)
    const item = items[index % items.length]!
    setNextTitle(item.title)
    setQueuePreview(`Next (#${(index % items.length) + 1}/${items.length}): ${item.title}`)
  }

  useEffect(() => {
    if (mode === 'library') void refreshPreview()
  }, [mode, queueKey, libraryId, textTemplate])

  const resolvedPreview = useMemo(() => {
    if (!selectedLibrary || !nextTitle) return ''
    const item = {
      id: 'preview',
      title: nextTitle,
      text: nextTitle,
    }
    return applyTextTemplate(textTemplate, {
      libraries,
      currentLibrary: selectedLibrary,
      currentItem: item,
    })
  }, [selectedLibrary, nextTitle, textTemplate, libraries])

  function toggleItem(id: string) {
    if (!selectedLibrary) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const ids = selectedLibrary.items.filter((item) => next.has(item.id)).map((item) => item.id)
    onChange({
      textItemIds: ids.length === selectedLibrary.items.length ? 'all' : ids,
    })
  }

  function selectAll() {
    onChange({ textItemIds: 'all' })
  }

  function clearSelection() {
    onChange({ textItemIds: [] })
  }

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">
          {isPaste ? 'Text to paste' : 'Text to type'}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {isPaste ? (
            <>
              TypeText-এর মতোই — library +{' '}
              <code className="rounded bg-background px-1">{'{_Story Title}'}</code> template — কিন্তু
              পুরো টেক্সট একবারে paste হবে (typing নয়)।
            </>
          ) : (
            <>
              Manual লিখুন, অথবা text library থেকে title বেছে নিয়ে prompt template-এ{' '}
              <code className="rounded bg-background px-1">{'{_Story Title}'}</code> বসান।
            </>
          )}
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">Source</span>
        <select
          className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
          value={mode === 'json_label' || mode === 'json_queue' ? 'manual' : mode}
          onChange={(event) =>
            onChange({
              textMode: event.target.value,
              ...(event.target.value === 'library' && libraries[0]
                ? {
                    textLibraryId: libraryId || libraries[0].id,
                    textItemIds: params.textItemIds ?? 'all',
                    textTemplate:
                      textTemplate ||
                      `writing a story about ${libraryPlaceholder(libraries[0].name)} — make it a long 20 minute story`,
                  }
                : {}),
            })
          }
        >
          <option value="manual">Manual text</option>
          <option value="library">Text library (pick titles)</option>
        </select>
      </label>

      {mode === 'manual' || mode === 'json_label' || mode === 'json_queue' ? (
        mode === 'manual' ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Text</span>
            <textarea
              className="min-h-24 w-full max-w-full resize-y break-words rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              value={String(params.text ?? '')}
              placeholder={isPaste ? 'What should be pasted…' : 'What should be typed…'}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </label>
        ) : (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">
            Old JSON mode detected. Switch Source to <strong>Text library</strong> and pick a list
            from Workflow Planner.
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full rounded-xl"
              onClick={() =>
                onChange({
                  textMode: 'library',
                  textLibraryId: libraries[0]?.id ?? '',
                  textItemIds: 'all',
                })
              }
            >
              Switch to text library
            </Button>
          </div>
        )
      ) : null}

      {mode === 'library' ? (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Library</span>
            <select
              className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              value={libraryId}
              onChange={(event) => {
                const nextId = event.target.value
                const nextLib = libraries.find((lib) => lib.id === nextId)
                onChange({
                  textLibraryId: nextId,
                  textItemIds: 'all',
                  ...(nextLib && !textTemplate.includes('{_')
                    ? {
                        textTemplate: `writing a story about ${libraryPlaceholder(nextLib.name)} — make it a long 20 minute story`,
                      }
                    : {}),
                })
              }}
            >
              <option value="">— choose library —</option>
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name} ({library.items.length})
                </option>
              ))}
            </select>
          </label>

          {!libraries.length ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[11px] text-muted-foreground">
              এখনো কোনো list নেই। Workflow Planner hub-এ গিয়ে Text libraries-এ নাম দিয়ে titles যোগ
              করুন।
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full rounded-xl"
                onClick={() => setBuilderOpen(false)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Open Workflow Planner libraries
              </Button>
            </div>
          ) : null}

          {selectedLibrary ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">Titles</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2 text-[10px]"
                    onClick={selectAll}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2 text-[10px]"
                    onClick={clearSelection}
                  >
                    None
                  </Button>
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-lg px-1 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  checked={allSelected}
                  onChange={(event) => (event.target.checked ? selectAll() : clearSelection())}
                />
                Select all ({selectedLibrary.items.length})
              </label>

              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-2">
                {selectedLibrary.items.map((item, index) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span className="min-w-0">
                      <span className="text-muted-foreground">{index + 1}.</span> {item.title}
                    </span>
                  </label>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">
                {selectedIds.size} selected
                {selectedIds.size > 1
                  ? ' · each Run uses the next selected title in the prompt'
                  : selectedIds.size === 1
                    ? ' · always uses this title in the prompt'
                    : ''}
              </p>

              <PromptTemplateField
                value={textTemplate}
                libraries={libraries}
                preferredLibraryName={selectedLibrary.name}
                onChange={(value) => onChange({ textTemplate: value })}
              />

              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {queuePreview || 'Refresh to preview next title'}
                </p>
                {resolvedPreview ? (
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
                    <span className="font-semibold text-muted-foreground">
                      {isPaste ? 'Will paste: ' : 'Will type: '}
                    </span>
                    {resolvedPreview}
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => void refreshPreview()}
                  >
                    Refresh next
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      if (!queueKey) return
                      void resetQueueCursor(workflowId, nodeId, queueKey).then(() =>
                        refreshPreview(),
                      )
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset queue
                  </Button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={params.queueWrap === true}
                  onChange={(event) => onChange({ queueWrap: event.target.checked })}
                />
                Wrap forever (off = stop after last title; use Repeat step for batch)
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {!isPaste ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Typing speed</span>
          <select
            className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
            value={String(params.typingSpeed ?? 'human')}
            onChange={(event) => onChange({ typingSpeed: event.target.value })}
          >
            <option value="human">Human-like</option>
            <option value="slow">Slow (careful)</option>
            <option value="instant">Instant</option>
          </select>
        </label>
      ) : (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-foreground">
          Paste mode: full text goes in at once — no typing delay.
        </p>
      )}
    </div>
  )
}

function PromptTemplateField({
  value,
  libraries,
  preferredLibraryName,
  onChange,
}: {
  value: string
  libraries: Array<{ id: string; name: string }>
  preferredLibraryName: string
  onChange: (value: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [menu, setMenu] = useState<{
    open: boolean
    start: number
    query: string
    active: number
  }>({ open: false, start: -1, query: '', active: 0 })

  const suggestions = useMemo(() => {
    const q = menu.query.trim().toLowerCase()
    const ranked = [...libraries].sort((a, b) => {
      if (a.name === preferredLibraryName) return -1
      if (b.name === preferredLibraryName) return 1
      return a.name.localeCompare(b.name)
    })
    if (!q) return ranked
    return ranked.filter((lib) => lib.name.toLowerCase().includes(q))
  }, [libraries, menu.query, preferredLibraryName])

  function detectTrigger(text: string, cursor: number) {
    const before = text.slice(0, cursor)
    const match = before.match(/\{\_([^}]*)$/)
    if (!match) {
      setMenu((prev) => (prev.open ? { ...prev, open: false } : prev))
      return
    }
    setMenu({
      open: true,
      start: cursor - match[0].length,
      query: match[1] ?? '',
      active: 0,
    })
  }

  function insertLibrary(name: string) {
    const el = textareaRef.current
    if (!el || menu.start < 0) {
      onChange(`${value}${libraryPlaceholder(name)}`)
      setMenu((prev) => ({ ...prev, open: false }))
      return
    }
    const cursor = el.selectionStart
    const before = value.slice(0, menu.start)
    const after = value.slice(cursor)
    const token = libraryPlaceholder(name)
    const next = `${before}${token}${after}`
    onChange(next)
    setMenu({ open: false, start: -1, query: '', active: 0 })
    requestAnimationFrame(() => {
      const pos = before.length + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <label className="relative block space-y-1.5">
      <span className="text-xs font-semibold text-foreground">Prompt template</span>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Normal sentence লিখুন। Type <code className="rounded bg-background px-1">{'{_'}</code> to
        insert a library (e.g. <code className="rounded bg-background px-1">{'{_Story Title}'}</code>
        ). Empty template = type title only.
      </p>
      <textarea
        ref={textareaRef}
        className="min-h-36 w-full max-w-full resize-y whitespace-pre-wrap break-words rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none ring-ring focus:ring-2"
        value={value}
        placeholder={`writing a story about ${libraryPlaceholder(preferredLibraryName || 'Story Title')} its long 20 minute`}
        onChange={(event) => {
          onChange(event.target.value)
          detectTrigger(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) =>
          detectTrigger(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyUp={(event) =>
          detectTrigger(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyDown={(event) => {
          if (!menu.open || !suggestions.length) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setMenu((prev) => ({
              ...prev,
              active: (prev.active + 1) % suggestions.length,
            }))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setMenu((prev) => ({
              ...prev,
              active: (prev.active - 1 + suggestions.length) % suggestions.length,
            }))
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            insertLibrary(suggestions[menu.active]?.name ?? preferredLibraryName)
          } else if (event.key === 'Escape') {
            setMenu((prev) => ({ ...prev, open: false }))
          }
        }}
        onBlur={() => {
          // Allow click on suggestion before closing
          window.setTimeout(() => setMenu((prev) => ({ ...prev, open: false })), 120)
        }}
      />

      {menu.open && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%-4px)] z-30 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <p className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Available libraries
          </p>
          <ul className="max-h-40 overflow-y-auto py-1">
            {suggestions.map((lib, index) => (
              <li key={lib.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-xs',
                    index === menu.active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertLibrary(lib.name)
                  }}
                >
                  <span className="font-semibold">{lib.name}</span>
                  <code className="text-[10px] text-muted-foreground">
                    {libraryPlaceholder(lib.name)}
                  </code>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {libraries.map((lib) => (
          <button
            key={lib.id}
            type="button"
            className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-primary/40 hover:bg-primary/10"
            onClick={() => {
              const el = textareaRef.current
              const token = libraryPlaceholder(lib.name)
              if (!el) {
                onChange(`${value}${token}`)
                return
              }
              const start = el.selectionStart
              const end = el.selectionEnd
              const next = `${value.slice(0, start)}${token}${value.slice(end)}`
              onChange(next)
              requestAnimationFrame(() => {
                const pos = start + token.length
                el.focus()
                el.setSelectionRange(pos, pos)
              })
            }}
          >
            + {lib.name}
          </button>
        ))}
      </div>
    </label>
  )
}

export const TYPE_TEXT_MANAGED_KEYS = new Set([
  'textMode',
  'text',
  'textTemplate',
  'textJson',
  'textLabel',
  'textQueueKey',
  'textLibraryId',
  'textItemIds',
  'queueWrap',
  'queueEnabled',
  'typingSpeed',
])
