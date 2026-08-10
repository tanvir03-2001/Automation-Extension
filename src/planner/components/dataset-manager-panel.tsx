import { useEffect, useMemo, useState } from 'react'
import { Braces, Download, Eye, EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { JsonTreePreview } from '@/planner/components/json-tree-preview'
import {
  findDatasetNameConflict,
  isValidDatasetName,
} from '@/planner/engine/dataset-utils'
import {
  buildDatasetExport,
  downloadJson,
  parseDatasetPayload,
  pickJsonFile,
  readJsonFile,
  safeDownloadName,
} from '@/planner/io/export-import'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'
import type { PlanDataset } from '@/planner/types/plan'

interface DatasetManagerPanelProps {
  planId: string | null
  compact?: boolean
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

export function DatasetManagerPanel({ planId, compact = false }: DatasetManagerPanelProps) {
  const t = useT()
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === planId))
  const createDataset = usePlannerStore((s) => s.createDataset)
  const updateDatasetMeta = usePlannerStore((s) => s.updateDatasetMeta)
  const updateDatasetData = usePlannerStore((s) => s.updateDatasetData)
  const deleteDataset = usePlannerStore((s) => s.deleteDataset)

  const datasets = plan?.datasets ?? []
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [valueText, setValueText] = useState('{\n  \n}')
  const [createError, setCreateError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const createNameStatus = useMemo(() => {
    if (!name.trim()) return { ok: false, message: t('dataset.nameRequired') }
    if (!isValidDatasetName(name)) return { ok: false, message: t('dataset.nameRequired') }
    const clash = findDatasetNameConflict(datasets, name)
    if (clash) return { ok: false, message: t('dataset.nameExists', { name: clash.name }) }
    return { ok: true, message: t('dataset.nameOk') }
  }, [name, datasets, t])

  function openCreate() {
    setCreating(true)
    setName('')
    setDescription('')
    setValueText('{\n  \n}')
    setCreateError(null)
  }

  function cancelCreate() {
    setCreating(false)
    setCreateError(null)
  }

  function saveCreate() {
    if (!planId) return
    if (!createNameStatus.ok) {
      setCreateError(createNameStatus.message)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(valueText)
    } catch {
      setCreateError(t('dataset.invalidJson'))
      return
    }
    try {
      createDataset(planId, {
        name: name.trim(),
        description: description.trim(),
        kind: 'custom',
        data: parsed,
      })
      cancelCreate()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    }
  }

  async function importDataset() {
    if (!planId) return
    try {
      const file = await pickJsonFile()
      if (!file) return
      const raw = await readJsonFile(file)
      const payload = parseDatasetPayload(raw)
      createDataset(planId, {
        name: payload.name,
        description: payload.description,
        kind: payload.datasetKind ?? 'custom',
        data: payload.data ?? {},
      })
      setToast(t('dataset.importOk', { name: payload.name }))
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    }
  }

  function exportDataset(dataset: PlanDataset) {
    downloadJson(safeDownloadName(dataset.name, 'dataset'), buildDatasetExport(dataset))
    setToast(t('dataset.exportOk'))
  }

  if (!planId) {
    return (
      <div
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card',
          !compact && 'rounded-3xl p-5',
        )}
      >
        <div className="border-b border-border px-3.5 py-3">
          <p className="text-base font-semibold text-foreground">{t('dataset.title')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('dataset.selectWorkflow')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-base font-semibold text-foreground">
            <Braces className="h-4 w-4 text-primary" />
            {t('dataset.title')}
          </p>
          <p className="truncate text-sm text-muted-foreground">{t('dataset.hint')}</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg px-2.5 text-sm"
            onClick={() => void importDataset()}
          >
            <Upload className="h-3.5 w-3.5" />
            {t('common.import')}
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-lg px-2.5 text-sm"
            onClick={openCreate}
            disabled={creating}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('dataset.create')}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2.5 p-3">
          {creating ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">{t('planner.name')}</span>
                <Input
                  className={cn(
                    'h-10',
                    name.trim() && !createNameStatus.ok && 'border-rose-500',
                    name.trim() && createNameStatus.ok && 'border-emerald-500/70',
                  )}
                  value={name}
                  placeholder={t('dataset.namePlaceholder')}
                  onChange={(event) => {
                    setName(event.target.value)
                    setCreateError(null)
                  }}
                  autoFocus
                />
                {name.trim() ? (
                  <p
                    className={cn(
                      'text-xs',
                      createNameStatus.ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-500',
                    )}
                  >
                    {createNameStatus.message}
                  </p>
                ) : null}
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">
                  {t('planner.description')}
                </span>
                <textarea
                  className="min-h-12 w-full resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-ring focus:ring-2"
                  value={description}
                  placeholder={t('dataset.descPlaceholder')}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">{t('dataset.value')}</span>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-sm leading-relaxed text-foreground outline-none ring-ring focus:ring-2"
                  value={valueText}
                  spellCheck={false}
                  onChange={(event) => {
                    setValueText(event.target.value)
                    setCreateError(null)
                  }}
                />
              </label>
              {createError ? <p className="text-sm text-rose-500">{createError}</p> : null}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-9 rounded-lg px-3 text-sm"
                  disabled={!createNameStatus.ok}
                  onClick={saveCreate}
                >
                  {t('common.save')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg px-3 text-sm"
                  onClick={cancelCreate}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : null}

          {datasets.length === 0 && !creating ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[15px] text-muted-foreground">
              {t('dataset.empty')}
            </p>
          ) : null}

          {datasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              planId={planId}
              dataset={dataset}
              datasets={datasets}
              onUpdateMeta={updateDatasetMeta}
              onUpdateData={updateDatasetData}
              onDelete={deleteDataset}
              onExport={() => exportDataset(dataset)}
            />
          ))}
        </div>
      </ScrollArea>

      {toast ? (
        <p className="absolute bottom-3 right-3 z-20 max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
          {toast}
        </p>
      ) : null}
    </div>
  )
}

function DatasetCard({
  planId,
  dataset,
  datasets,
  onUpdateMeta,
  onUpdateData,
  onDelete,
  onExport,
}: {
  planId: string
  dataset: PlanDataset
  datasets: PlanDataset[]
  onUpdateMeta: (
    planId: string,
    datasetId: string,
    patch: { name?: string; description?: string },
  ) => void
  onUpdateData: (planId: string, datasetId: string, data: unknown) => void
  onDelete: (planId: string, datasetId: string) => void
  onExport: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [metaName, setMetaName] = useState(dataset.name)
  const [metaDescription, setMetaDescription] = useState(dataset.description ?? '')
  const [valueText, setValueText] = useState(stringifyJson(dataset.data))
  const [error, setError] = useState<string | null>(null)

  const metaNameStatus = useMemo(() => {
    if (!metaName.trim()) return { ok: false, message: t('dataset.nameRequired') }
    const clash = findDatasetNameConflict(datasets, metaName, dataset.id)
    if (clash) return { ok: false, message: t('dataset.nameExists', { name: clash.name }) }
    return { ok: true, message: t('dataset.nameOk') }
  }, [metaName, datasets, dataset.id, t])

  function startEdit() {
    setMetaName(dataset.name)
    setMetaDescription(dataset.description ?? '')
    setValueText(stringifyJson(dataset.data))
    setError(null)
    setViewing(false)
    setEditing(true)
  }

  function saveEdit() {
    if (!metaNameStatus.ok) {
      setError(metaNameStatus.message)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(valueText)
    } catch {
      setError(t('dataset.invalidJson'))
      return
    }
    try {
      onUpdateMeta(planId, dataset.id, {
        name: metaName,
        description: metaDescription,
      })
      onUpdateData(planId, dataset.id, parsed)
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="rounded-xl border border-border/80 bg-background/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-foreground">{dataset.name}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {dataset.description || t('common.noDescription')}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          JSON
        </Badge>
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <Input
            className={cn('h-9', !metaNameStatus.ok && 'border-rose-500')}
            value={metaName}
            onChange={(event) => setMetaName(event.target.value)}
          />
          <textarea
            className="min-h-10 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            value={metaDescription}
            placeholder={t('planner.description')}
            onChange={(event) => setMetaDescription(event.target.value)}
          />
          <textarea
            className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-sm leading-relaxed outline-none ring-ring focus:ring-2"
            value={valueText}
            spellCheck={false}
            onChange={(event) => {
              setValueText(event.target.value)
              setError(null)
            }}
          />
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <div className="flex gap-1">
            <Button size="sm" className="h-8 px-2.5 text-sm" onClick={saveEdit}>
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-sm"
              onClick={() => setEditing(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-sm"
              onClick={() => setViewing((v) => !v)}
            >
              {viewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {viewing ? t('dataset.hidePreview') : t('common.view')}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" />
              {t('common.edit')}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-sm" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              {t('common.export')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-sm text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(t('dataset.deleteConfirm', { name: dataset.name }))) {
                  onDelete(planId, dataset.id)
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete')}
            </Button>
          </div>
          {viewing ? (
            <div className="mt-2.5">
              <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                {t('dataset.preview')}
              </p>
              <JsonTreePreview value={dataset.data} className="max-h-64" />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
