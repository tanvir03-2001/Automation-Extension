import { useMemo, useState } from 'react'
import { BookOpen, Braces, Database, Pencil, Plus, Trash2 } from 'lucide-react'
import { DynamicJsonEditor } from '@/planner/components/dynamic-json-editor'
import {
  extractTextItems,
  findDatasetNameConflict,
  isValidDatasetName,
} from '@/planner/engine/dataset-utils'
import { parseNumberedTextList } from '@/planner/engine/text-library'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/shared/utils/cn'
import { createId } from '@/shared/utils/id'
import type { PlanDataset, PlanDatasetKind } from '@/planner/types/plan'

const SAMPLE_LIST = `1. Sleeping on Mars
2. Journey Through the Galaxy
3. A Walk Through a Quiet Village
4. The Old Lighthouse
5. Overnight Train Across America
6. The Enchanted Library`

interface DatasetManagerPanelProps {
  planId: string | null
}

function itemsToEditableText(dataset: PlanDataset): string {
  const items = extractTextItems(dataset.data)
  if (!items.length) return ''
  return items.map((item, index) => `${index + 1}. ${item.title}`).join('\n')
}

export function DatasetManagerPanel({ planId }: DatasetManagerPanelProps) {
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === planId))
  const createDataset = usePlannerStore((s) => s.createDataset)
  const updateDatasetMeta = usePlannerStore((s) => s.updateDatasetMeta)
  const updateDatasetData = usePlannerStore((s) => s.updateDatasetData)
  const deleteDataset = usePlannerStore((s) => s.deleteDataset)

  const datasets = plan?.datasets ?? []
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<PlanDatasetKind>('custom')
  const [createError, setCreateError] = useState<string | null>(null)

  const createNameStatus = useMemo(() => {
    if (!name.trim()) return { ok: false, message: 'Name is required' }
    if (!isValidDatasetName(name)) return { ok: false, message: 'Name is required' }
    const clash = findDatasetNameConflict(datasets, name)
    if (clash) return { ok: false, message: `“${clash.name}” already exists` }
    return { ok: true, message: 'Name is available' }
  }, [name, datasets])

  function openCreate() {
    setCreating(true)
    setName('')
    setDescription('')
    setKind('custom')
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
    try {
      createDataset(planId, {
        name: name.trim(),
        description: description.trim(),
        kind,
      })
      cancelCreate()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!planId) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <p className="font-display text-lg font-semibold">Datasets</p>
        <p className="mt-2 text-sm text-muted-foreground">Select a workflow first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Create control only — each dataset is its own section card below */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-semibold">
              <Database className="h-4 w-4 text-primary" />
              Datasets
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a dataset and a section appears below (like the old Text libraries / Copy Store
              cards). Unique names only — Map & TypeText reference them without copying data.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl"
            onClick={openCreate}
            disabled={creating}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Dataset
          </Button>
        </div>

        {creating ? (
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Name</span>
              <Input
                className={cn(
                  'h-9 rounded-xl',
                  name.trim() && !createNameStatus.ok && 'border-rose-500',
                  name.trim() && createNameStatus.ok && 'border-emerald-500/70',
                )}
                value={name}
                placeholder="e.g. User Profile, Story Title, API Config"
                onChange={(event) => {
                  setName(event.target.value)
                  setCreateError(null)
                }}
                autoFocus
              />
              {name.trim() ? (
                <p
                  className={cn(
                    'text-[11px]',
                    createNameStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500',
                  )}
                >
                  {createNameStatus.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Checked while typing</p>
              )}
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Description</span>
              <textarea
                className="min-h-16 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                value={description}
                placeholder="Optional"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Section type</span>
              <select
                className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm outline-none ring-ring focus:ring-2"
                value={kind}
                onChange={(event) => setKind(event.target.value as PlanDatasetKind)}
              >
                <option value="textLibrary">Text list (numbered titles — TypeText)</option>
                <option value="custom">Custom JSON (nested data)</option>
              </select>
            </label>
            {createError ? <p className="text-[11px] text-rose-500">{createError}</p> : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-xl"
                disabled={!createNameStatus.ok}
                onClick={saveCreate}
              >
                Create section
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={cancelCreate}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {datasets.length === 0 && !creating ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No dataset sections yet. Click{' '}
            <span className="font-medium text-foreground">Create Dataset</span> — a new card will
            appear below, same style as the old Text libraries section.
          </p>
        ) : null}
      </div>

      {/* One card per dataset — same visual language as former Text libraries / Copy Store */}
      {datasets.map((dataset) => (
        <DatasetSectionCard
          key={dataset.id}
          planId={planId}
          dataset={dataset}
          datasets={datasets}
          onUpdateMeta={updateDatasetMeta}
          onUpdateData={updateDatasetData}
          onDelete={deleteDataset}
        />
      ))}
    </div>
  )
}

function DatasetSectionCard({
  planId,
  dataset,
  datasets,
  onUpdateMeta,
  onUpdateData,
  onDelete,
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
}) {
  const isTextList = dataset.kind === 'textLibrary'
  const items = extractTextItems(dataset.data)
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaName, setMetaName] = useState(dataset.name)
  const [metaDescription, setMetaDescription] = useState(dataset.description ?? '')
  const [metaError, setMetaError] = useState<string | null>(null)
  const [editingList, setEditingList] = useState(false)
  const [rawText, setRawText] = useState('')
  const [showJson, setShowJson] = useState(true)

  const metaNameStatus = useMemo(() => {
    if (!metaName.trim()) return { ok: false, message: 'Name is required' }
    const clash = findDatasetNameConflict(datasets, metaName, dataset.id)
    if (clash) return { ok: false, message: `“${clash.name}” already exists` }
    return { ok: true, message: 'Name is available' }
  }, [metaName, datasets, dataset.id])

  function startEditList() {
    setRawText(itemsToEditableText(dataset) || SAMPLE_LIST)
    setEditingList(true)
  }

  function saveList() {
    const parsed = parseNumberedTextList(rawText)
    const nextItems = parsed.map((row) => ({
      id: createId('ti'),
      title: row.title,
      text: row.text,
    }))
    onUpdateData(planId, dataset.id, { items: nextItems })
    setEditingList(false)
  }

  function saveMeta() {
    if (!metaNameStatus.ok) {
      setMetaError(metaNameStatus.message)
      return
    }
    try {
      onUpdateMeta(planId, dataset.id, {
        name: metaName,
        description: metaDescription,
      })
      setEditingMeta(false)
      setMetaError(null)
    } catch (error) {
      setMetaError(error instanceof Error ? error.message : String(error))
    }
  }

  const Icon = isTextList ? BookOpen : Braces

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{dataset.name}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {dataset.description ||
              (isTextList
                ? 'Text list — use from TypeText or Map. One title per line; JSON not required.'
                : 'Custom JSON dataset — nested lists & objects. Map references this section by name.')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">{isTextList ? `${items.length}` : 'JSON'}</Badge>
          {isTextList ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={startEditList}
              disabled={editingList}
            >
              <Pencil className="h-3.5 w-3.5" />
              {items.length ? 'Edit list' : 'Add titles'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowJson((value) => !value)}
            >
              {showJson ? 'Hide editor' : 'Edit JSON'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-lg p-0"
            title="Rename / description"
            onClick={() => {
              setMetaName(dataset.name)
              setMetaDescription(dataset.description ?? '')
              setEditingMeta(true)
              setMetaError(null)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-lg p-0 text-rose-500"
            title="Delete section"
            onClick={() => {
              if (
                window.confirm(
                  `Delete “${dataset.name}”? Events that use this dataset will need a new source.`,
                )
              ) {
                onDelete(planId, dataset.id)
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editingMeta ? (
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <Input
            className={cn(
              'h-9 rounded-xl',
              !metaNameStatus.ok && 'border-rose-500',
              metaNameStatus.ok && 'border-emerald-500/70',
            )}
            value={metaName}
            onChange={(event) => {
              setMetaName(event.target.value)
              setMetaError(null)
            }}
          />
          <p
            className={cn(
              'text-[11px]',
              metaNameStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500',
            )}
          >
            {metaNameStatus.message}
          </p>
          <textarea
            className="min-h-14 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            value={metaDescription}
            placeholder="Description"
            onChange={(event) => setMetaDescription(event.target.value)}
          />
          {metaError ? <p className="text-[11px] text-rose-500">{metaError}</p> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!metaNameStatus.ok}
              onClick={saveMeta}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setEditingMeta(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {isTextList ? (
        <div className="mt-4 space-y-2">
          {items.length === 0 && !editingList ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No titles yet. Click <span className="font-medium text-foreground">Add titles</span>{' '}
              and paste numbered lines.
            </p>
          ) : null}
          {items.length > 0 && !editingList ? (
            <ul className="space-y-1.5">
              {items.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-border px-3 py-2 text-sm text-foreground"
                >
                  {item.title}
                </li>
              ))}
              {items.length > 8 ? (
                <li className="px-1 text-[11px] text-muted-foreground">
                  +{items.length - 8} more
                </li>
              ) : null}
            </ul>
          ) : null}
          {editingList ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-foreground">Titles (one per line)</span>
                <textarea
                  className="min-h-40 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground outline-none ring-ring focus:ring-2"
                  value={rawText}
                  placeholder={SAMPLE_LIST}
                  onChange={(event) => setRawText(event.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl" onClick={saveList}>
                  Save list
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setEditingList(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : showJson ? (
        <div className="mt-4">
          <DynamicJsonEditor
            value={dataset.data}
            onChange={(data) => onUpdateData(planId, dataset.id, data)}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          JSON editor hidden. Click <span className="font-medium text-foreground">Edit JSON</span>{' '}
          to expand.
        </p>
      )}
    </div>
  )
}
