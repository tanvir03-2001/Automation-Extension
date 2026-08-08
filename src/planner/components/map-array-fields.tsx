import { useEffect, useMemo, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import {
  COPY_STORE_ALL_REF,
  getCopyStoreEntryRoot,
  getMapArraySource,
  getMapArraySources,
  listNestPathOptions,
  loadMapArrayContext,
  type MapArrayOption,
  type MapArraySourceContext,
  type MapArraySourceDefinition,
} from '@/planner/engine/map-array-sources'
import type { JsonArrayPathOption } from '@/planner/engine/custom-section-paths'
import { usePlannerStore } from '@/planner/store/planner-store'
import { useLocale } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'

export const MAP_ARRAY_MANAGED_KEYS = new Set([
  'collectionKey',
  'collectionSource',
  'collectionRef',
  'collectionPath',
])

interface MapArrayFieldsProps {
  workflowId: string
  params: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function MapArrayFields({ workflowId, params, onChange }: MapArrayFieldsProps) {
  const locale = useLocale()
  const bn = locale === 'bn'
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === workflow?.planId))
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const libraries = plan?.textLibraries ?? []
  const customSections = plan?.customSections ?? []
  const datasets = plan?.datasets ?? []

  const sourceId = String(params.collectionSource ?? '')
  const collectionRef = String(params.collectionRef ?? '')
  const collectionPath = String(params.collectionPath ?? '')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [ctx, setCtx] = useState<MapArraySourceContext | null>(null)
  const [itemCount, setItemCount] = useState<number | null>(null)

  const syncCtx = useMemo((): MapArraySourceContext => {
    return {
      planId: plan?.id,
      workflowId,
      variables: checkpoint?.variables ?? {},
      textLibraries: libraries,
      copyEntries: ctx?.copyEntries ?? [],
      customSections,
      datasets,
    }
  }, [
    plan?.id,
    workflowId,
    checkpoint?.variables,
    libraries,
    customSections,
    datasets,
    ctx?.copyEntries,
  ])

  const sources = useMemo(() => getMapArraySources(syncCtx), [syncCtx])
  const source: MapArraySourceDefinition | undefined = getMapArraySource(sourceId, syncCtx)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await loadMapArrayContext({
        planId: plan?.id,
        workflowId,
        variables: checkpoint?.variables ?? {},
        customSections,
        datasets,
      })
      if (!cancelled) setCtx(next)
    })()
    return () => {
      cancelled = true
    }
  }, [
    plan?.id,
    workflowId,
    checkpoint?.updatedAt,
    checkpoint?.variables,
    libraries,
    customSections,
    datasets,
  ])

  const activeCtx = ctx ?? syncCtx
  const secondOptions: MapArrayOption[] = source ? source.listOptions(activeCtx) : []

  const nestOptions: JsonArrayPathOption[] = useMemo(() => {
    if (!source?.supportsNestPath || !collectionRef || collectionRef === COPY_STORE_ALL_REF) {
      return []
    }
    const root = getCopyStoreEntryRoot(activeCtx, collectionRef)
    if (root == null) return []
    return listNestPathOptions(root)
  }, [source?.supportsNestPath, collectionRef, activeCtx])

  const showNestPath = nestOptions.length > 0

  // Auto-select first list when options arrive
  useEffect(() => {
    if (!sourceId || collectionRef || secondOptions.length === 0) return
    const first = secondOptions[0]!
    onChangeRef.current({
      collectionRef: first.value,
      collectionKey: first.label,
      collectionPath: '',
    })
  }, [sourceId, collectionRef, secondOptions])

  // Auto-select nest path "$" (or first) when entry changes and nest options exist
  useEffect(() => {
    if (!showNestPath) return
    if (collectionPath && nestOptions.some((item) => item.value === collectionPath)) return
    const preferred =
      nestOptions.find((item) => item.value === '$') ?? nestOptions[0]
    if (!preferred) return
    onChangeRef.current({
      collectionPath: preferred.value,
      collectionKey: preferred.label,
    })
  }, [showNestPath, collectionPath, nestOptions])

  // Preview item count
  useEffect(() => {
    if (!sourceId || !collectionRef || !source) {
      setItemCount(null)
      return
    }
    const path = showNestPath ? collectionPath || '$' : undefined
    setItemCount(source.resolveItems(activeCtx, collectionRef, path).length)
  }, [sourceId, collectionRef, collectionPath, source, activeCtx, showNestPath])

  function selectSource(next: string) {
    if (!next) {
      onChange({
        collectionSource: '',
        collectionRef: '',
        collectionPath: '',
        collectionKey: '',
      })
      return
    }
    const def = getMapArraySource(next, activeCtx)
    const options = def?.listOptions(activeCtx) ?? []
    const first = options[0]?.value ?? ''
    const label = options[0]?.label ?? ''
    onChange({
      collectionSource: next,
      collectionRef: first,
      collectionPath: '',
      collectionKey: label || next,
    })
  }

  function selectRef(next: string) {
    const option = secondOptions.find((item) => item.value === next)
    onChange({
      collectionRef: next,
      collectionPath: '',
      collectionKey: option?.label ?? next,
    })
  }

  function selectPath(next: string) {
    const option = nestOptions.find((item) => item.value === next)
    onChange({
      collectionPath: next,
      collectionKey: option?.label ?? next,
    })
  }

  const emptyMessage =
    source && secondOptions.length === 0
      ? bn
        ? source.emptyBn
        : source.emptyEn
      : null

  return (
    <div className="min-w-0 space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
          <Layers className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {bn ? 'অ্যারে সোর্স' : 'Array source'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {bn
              ? 'সেকশন (Datasets / Text libraries / Copy Store) → লিস্ট → প্রয়োজনে নেস্টেড পাথ। ডেটা ইভেন্টে কপি হয় না — রেফারেন্স।'
              : 'Section (Datasets / Text libraries / Copy Store) → list → nested path. Events reference data — no copy.'}
          </p>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {bn ? 'সেকশন' : 'Section'}
        </span>
        <select
          className={cn(
            'h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2',
            !sourceId && 'text-muted-foreground',
          )}
          value={sourceId}
          onChange={(event) => selectSource(event.target.value)}
        >
          <option value="">{bn ? 'সেকশন বেছে নিন…' : 'Choose a section…'}</option>
          {sources.map((item) => (
            <option key={item.id} value={item.id}>
              {bn ? item.labelBn : item.labelEn}
            </option>
          ))}
        </select>
      </label>

      {sourceId ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {bn ? 'লিস্ট / আইটেম' : 'List / item'}
          </span>
          {emptyMessage ? (
            <p className="rounded-xl border border-dashed border-border bg-background px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <select
              className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              value={collectionRef}
              onChange={(event) => selectRef(event.target.value)}
            >
              <option value="">{bn ? 'সিলেক্ট করুন…' : 'Select…'}</option>
              {secondOptions.map((option) => {
                const label =
                  option.value === COPY_STORE_ALL_REF && bn ? 'সব এন্ট্রি' : option.label
                const hint =
                  option.value === COPY_STORE_ALL_REF && bn && option.hint
                    ? option.hint.replace('items', 'টি').replace('item', 'টি')
                    : option.hint
                return (
                  <option key={option.value} value={option.value}>
                    {hint ? `${label} (${hint})` : label}
                  </option>
                )
              })}
            </select>
          )}
        </label>
      ) : null}

      {showNestPath ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            {bn ? 'নেস্টেড পাথ' : 'Nested path'}
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {bn
              ? 'এই JSON-এর ভিতরে কোন লিস্ট/ফিল্ডে Map চলবে তা বেছে নিন।'
              : 'Pick which list or field inside this JSON Map should iterate.'}
          </p>
          <select
            className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
            value={collectionPath || '$'}
            onChange={(event) => selectPath(event.target.value)}
          >
            {nestOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.hint ? `${option.label} (${option.hint})` : option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {sourceId && collectionRef && itemCount != null ? (
        <p className="text-[11px] text-muted-foreground">
          {bn ? (
            <>
              Map <strong className="text-foreground">{itemCount}</strong> টি আইটেমে চলবে ·{' '}
              <code className="rounded bg-background px-1">{'{{item}}'}</code>
            </>
          ) : (
            <>
              Map will iterate <strong className="text-foreground">{itemCount}</strong> item
              {itemCount === 1 ? '' : 's'} · use{' '}
              <code className="rounded bg-background px-1">{'{{item}}'}</code>
            </>
          )}
        </p>
      ) : null}
    </div>
  )
}
