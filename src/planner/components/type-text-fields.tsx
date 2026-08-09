import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, RotateCcw } from 'lucide-react'
import {
  applyTextTemplate,
  getQueueCursor,
  libraryPlaceholder,
  resetQueueCursor,
} from '@/planner/engine/text-library'
import { resolveLoopScope } from '@/planner/engine/loop-scope'
import { JsonPathPicker, previewJsonPath } from '@/planner/components/json-path-picker'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'

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
  const t = useT()
  const isPaste = variant === 'paste'
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === workflow?.planId))
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)

  const scope = useMemo(
    () => (workflow ? resolveLoopScope(workflow, nodeId, plan) : { kind: 'outside' as const }),
    [workflow, nodeId, plan],
  )
  const insideLoop = scope.kind === 'body'
  const loopFrame = insideLoop ? scope.stack[scope.stack.length - 1] : undefined

  const libraries = plan?.textLibraries ?? []
  const datasets = plan?.datasets ?? []
  const mode = String(params.textMode ?? 'manual')
  const libraryId = String(params.textLibraryId ?? '')
  const selectedLibrary = libraries.find((lib) => lib.id === libraryId) ?? null
  const textTemplate = String(params.textTemplate ?? '')
  const datasetId = String(params.textDatasetId ?? '')
  const selectedDataset = datasets.find((ds) => ds.id === datasetId || ds.name === datasetId) ?? null
  const dataPath = String(params.textDataPath ?? '')
  const itemVariable =
    String(params.textItemVariable ?? loopFrame?.itemVariable ?? 'item').trim() || 'item'
  const itemPath = String(params.textItemPath ?? '')

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

  const datasetPreview = useMemo(() => {
    if (!selectedDataset) return ''
    return previewJsonPath(selectedDataset.data, dataPath)
  }, [selectedDataset, dataPath])

  const loopPreview = useMemo(() => {
    if (!loopFrame) return ''
    const sample = loopFrame.sampleItem
    if (sample === undefined) return `{{${itemVariable}${itemPath ? `.${itemPath}` : ''}}}`
    const value = previewJsonPath(sample, itemPath)
    return value || `{{${itemVariable}${itemPath ? `.${itemPath}` : ''}}}`
  }, [loopFrame, itemVariable, itemPath])

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

  const sourceSelectValue =
    mode === 'json_label' || mode === 'json_queue' ? 'manual' : mode
  const showLibraryOption = mode === 'library'

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">
          {isPaste ? t('typeText.pasteTitle') : t('typeText.typeTitle')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {insideLoop
            ? t('typeText.helpInsideLoop')
            : isPaste
              ? t('typeText.helpPaste')
              : t('typeText.helpOutside')}
        </p>
        {insideLoop && loopFrame ? (
          <p className="mt-1.5 rounded-lg bg-primary/10 px-2 py-1 text-[11px] text-foreground">
            {t('typeText.insideMap', { name: loopFrame.label })}
          </p>
        ) : null}
        {scope.kind === 'completed' ? (
          <p className="mt-1.5 rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            {t('typeText.onCompleted', { name: scope.label })}
          </p>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">{t('typeText.source')}</span>
        <select
          className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
          value={sourceSelectValue}
          onChange={(event) => {
            const next = event.target.value
            if (next === 'manual') {
              onChange({ textMode: 'manual' })
              return
            }
            if (next === 'dataset') {
              onChange({
                textMode: 'dataset',
                textDatasetId: datasetId || datasets[0]?.id || '',
                textDataPath: dataPath,
              })
              return
            }
            if (next === 'loop_item') {
              onChange({
                textMode: 'loop_item',
                textItemVariable: loopFrame?.itemVariable ?? 'item',
                textItemPath: itemPath,
              })
              return
            }
            if (next === 'library') {
              onChange({
                textMode: 'library',
                textLibraryId: libraryId || libraries[0]?.id || '',
                textItemIds: params.textItemIds ?? 'all',
                textTemplate:
                  textTemplate ||
                  (libraries[0]
                    ? `writing a story about ${libraryPlaceholder(libraries[0].name)} — make it a long 20 minute story`
                    : ''),
              })
            }
          }}
        >
          <option value="manual">{t('typeText.sourceManual')}</option>
          {insideLoop ? (
            <option value="loop_item">{t('typeText.sourceLoopItem')}</option>
          ) : (
            <option value="dataset">{t('typeText.sourceDataset')}</option>
          )}
          {/* Keep current mode selectable if scope moved (legacy / edge cases) */}
          {mode === 'dataset' && insideLoop ? (
            <option value="dataset">{t('typeText.sourceDataset')}</option>
          ) : null}
          {mode === 'loop_item' && !insideLoop ? (
            <option value="loop_item">{t('typeText.sourceLoopItem')}</option>
          ) : null}
          {showLibraryOption ? (
            <option value="library">{t('typeText.sourceLibraryLegacy')}</option>
          ) : null}
        </select>
      </label>

      {mode === 'manual' || mode === 'json_label' || mode === 'json_queue' ? (
        mode === 'manual' ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">{t('typeText.text')}</span>
            <textarea
              className="min-h-24 w-full max-w-full resize-y break-words rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              value={String(params.text ?? '')}
              placeholder={isPaste ? t('typeText.placeholderPaste') : t('typeText.placeholderType')}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </label>
        ) : (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">
            {t('typeText.legacyJson')}
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full rounded-xl"
              onClick={() =>
                onChange(
                  insideLoop
                    ? {
                        textMode: 'loop_item',
                        textItemVariable: loopFrame?.itemVariable ?? 'item',
                      }
                    : {
                        textMode: 'dataset',
                        textDatasetId: datasets[0]?.id ?? '',
                      },
                )
              }
            >
              {insideLoop ? t('typeText.switchLoopItem') : t('typeText.switchDataset')}
            </Button>
          </div>
        )
      ) : null}

      {mode === 'dataset' ? (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">{t('typeText.dataset')}</span>
            <select
              className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              value={datasetId}
              onChange={(event) =>
                onChange({ textDatasetId: event.target.value, textDataPath: '' })
              }
            >
              <option value="">{t('typeText.chooseDataset')}</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </label>

          {!datasets.length ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[11px] text-muted-foreground">
              {t('typeText.noDatasets')}
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full rounded-xl"
                onClick={() => setBuilderOpen(false)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {t('typeText.openDatasets')}
              </Button>
            </div>
          ) : null}

          {selectedDataset ? (
            <>
              <JsonPathPicker
                root={selectedDataset.data}
                path={dataPath}
                rootLabel={selectedDataset.name}
                onChange={(nextPath) => onChange({ textDataPath: nextPath })}
              />
              {datasetPreview ? (
                <div className="rounded-xl border border-border bg-background px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {isPaste ? t('typeText.willPaste') : t('typeText.willType')}
                    </span>{' '}
                    {datasetPreview}
                  </p>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={params.queueWrap === true}
                  onChange={(event) => onChange({ queueWrap: event.target.checked })}
                />
                {t('typeText.queueWrap')}
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      {mode === 'loop_item' && !insideLoop ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">
          {t('typeText.loopItemOutside')}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full rounded-xl"
            onClick={() =>
              onChange({
                textMode: 'dataset',
                textDatasetId: datasets[0]?.id ?? '',
              })
            }
          >
            {t('typeText.switchDataset')}
          </Button>
        </div>
      ) : null}

      {mode === 'loop_item' && insideLoop && loopFrame ? (
        <div className="space-y-3">
          {scope.stack.length > 1 ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">
                {t('typeText.loopVariable')}
              </span>
              <select
                className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                value={itemVariable}
                onChange={(event) =>
                  onChange({
                    textItemVariable: event.target.value,
                    textItemPath: '',
                  })
                }
              >
                {scope.stack.map((frame) => (
                  <option key={frame.loopNodeId} value={frame.itemVariable}>
                    {frame.label} → {`{{${frame.itemVariable}}}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t('typeText.bindItem', { name: `{{${itemVariable}}}` })}
            </p>
          )}

          {(() => {
            const frame =
              scope.stack.find((item) => item.itemVariable === itemVariable) ?? loopFrame
            const sample = frame.sampleItem
            if (sample === undefined) {
              return (
                <p className="rounded-xl border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                  {t('typeText.noSampleItem')}
                </p>
              )
            }
            return (
              <JsonPathPicker
                root={sample}
                path={itemPath}
                rootLabel={`{{${itemVariable}}}`}
                onChange={(nextPath) =>
                  onChange({
                    textItemVariable: itemVariable,
                    textItemPath: nextPath,
                  })
                }
              />
            )
          })()}

          {loopPreview ? (
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isPaste ? t('typeText.willPaste') : t('typeText.willType')}
                </span>{' '}
                {loopPreview}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Inside loop but still on dataset/library — nudge */}
      {insideLoop && (mode === 'dataset' || mode === 'library') ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">
          {t('typeText.insideLoopHint')}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full rounded-xl"
            onClick={() =>
              onChange({
                textMode: 'loop_item',
                textItemVariable: loopFrame?.itemVariable ?? 'item',
                textItemPath: '',
              })
            }
          >
            {t('typeText.switchLoopItem')}
          </Button>
        </div>
      ) : null}

      {mode === 'library' ? (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">
              {t('typeText.sourceLibraryLegacy')}
            </span>
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
              {t('typeText.noLibraries')}
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full rounded-xl"
                onClick={() => setBuilderOpen(false)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {t('typeText.openLibraries')}
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
                      {isPaste ? t('typeText.willPaste') : t('typeText.willType')}
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
                {t('typeText.queueWrap')}
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {!isPaste ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-foreground">{t('typeText.typingSpeed')}</span>
          <select
            className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
            value={String(params.typingSpeed ?? 'human')}
            onChange={(event) => onChange({ typingSpeed: event.target.value })}
          >
            <option value="human">{t('typeText.speedHuman')}</option>
            <option value="slow">{t('typeText.speedSlow')}</option>
            <option value="instant">{t('typeText.speedInstant')}</option>
          </select>
        </label>
      ) : (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-foreground">
          {t('typeText.pasteModeNote')}
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
  'textDatasetId',
  'textDataPath',
  'textItemVariable',
  'textItemPath',
  'queueWrap',
  'queueEnabled',
  'typingSpeed',
])
