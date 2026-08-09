/**
 * Extensible Map array sources — first dropdown = section, second = item in section.
 * Built-ins (Text libraries, Copy Store) stay for compatibility; Datasets are dynamic
 * and referenced by id (no data copy into the event).
 */

import {
  list,
  loadDurableWorkflowStore,
  mergeStoresForDisplay,
  isWorkflowCopyStore,
} from '@/engine/copy-store'
import type { CopyStoreEntry, WorkflowCopyStore } from '@/engine/copy-store'
import { storageGet } from '@/shared/storage/chrome-storage'
import { loadPlanTextLibraries } from '@/planner/engine/text-library'
import {
  customSectionSourceId,
  discoverJsonArrayPaths,
  parseCustomSectionSourceId,
  parseFlexibleData,
  resolveJsonPathToArray,
  type JsonArrayPathOption,
} from '@/planner/engine/custom-section-paths'
import {
  datasetSourceId,
  extractTextItems,
  parseDatasetSourceId,
} from '@/planner/engine/dataset-utils'
import { resolveCollection } from '@/planner/engine/map-loop'
import type {
  AutomationPlan,
  PlanCustomSection,
  PlanDataset,
  PlanTextLibrary,
} from '@/planner/types/plan'

/** Special ref: iterate every Copy Store entry’s text */
export const COPY_STORE_ALL_REF = '__all__'

export type MapArrayOption = {
  value: string
  label: string
  hint?: string
}

export type MapArraySourceContext = {
  planId?: string
  workflowId?: string
  variables: Record<string, unknown>
  textLibraries: PlanTextLibrary[]
  copyEntries: CopyStoreEntry[]
  /** @deprecated Prefer datasets — kept for older Map nodes */
  customSections: PlanCustomSection[]
  datasets: PlanDataset[]
}

export type MapArraySourceDefinition = {
  id: string
  labelEn: string
  labelBn: string
  emptyEn: string
  emptyBn: string
  listOptions: (ctx: MapArraySourceContext) => MapArrayOption[]
  /**
   * @param nestPath optional nested JSON path inside the selected ref
   *   (Copy Store entry body, etc.). Default "$" = top list of that ref.
   */
  resolveItems: (ctx: MapArraySourceContext, ref: string, nestPath?: string) => unknown[]
  /** True when this source supports a third “Nested path” dropdown after List */
  supportsNestPath?: boolean
}

/** Parsed root JSON for a Copy Store entry (or null if not nestable). */
export function getCopyStoreEntryRoot(
  ctx: MapArraySourceContext,
  ref: string,
): unknown | null {
  if (!ref || ref === COPY_STORE_ALL_REF) return null
  const entry = ctx.copyEntries.find((item) => item.name === ref)
  if (!entry) return null
  return parseFlexibleData(entry.text)
}

/** Nested path options inside a selected Copy Store entry / similar root. */
export function listNestPathOptions(root: unknown): JsonArrayPathOption[] {
  if (root == null || root === '') return []
  return discoverJsonArrayPaths(root)
}

/** Hardcoded built-in sections — unchanged behavior */
export const MAP_ARRAY_SOURCES: MapArraySourceDefinition[] = [
  {
    id: 'textLibrary',
    labelEn: 'Text libraries',
    labelBn: 'টেক্সট লাইব্রেরি',
    emptyEn: 'No text libraries yet. Create one in Text libraries on this Workflow.',
    emptyBn: 'এখনো কোনো টেক্সট লাইব্রেরি নেই। এই ওয়ার্কফ্লোর Text libraries-এ একটি বানান।',
    listOptions: (ctx) =>
      ctx.textLibraries.map((lib) => ({
        value: lib.id,
        label: lib.name,
        hint: `${lib.items.length} item${lib.items.length === 1 ? '' : 's'}`,
      })),
    resolveItems: (ctx, ref) => {
      const lib = ctx.textLibraries.find((item) => item.id === ref)
      if (!lib) return []
      return lib.items.map((item) => item.title)
    },
  },
  {
    id: 'copyStore',
    labelEn: 'Copy Store',
    labelBn: 'কপি স্টোর',
    emptyEn: 'Copy Store is empty. Run a Copy Event first, or pick another source.',
    emptyBn: 'কপি স্টোর খালি। আগে Copy Event চালান, অথবা অন্য সোর্স বেছে নিন।',
    supportsNestPath: true,
    listOptions: (ctx) => {
      if (!ctx.copyEntries.length) return []
      return [
        {
          value: COPY_STORE_ALL_REF,
          label: 'All entries',
          hint: `${ctx.copyEntries.length} item${ctx.copyEntries.length === 1 ? '' : 's'}`,
        },
        ...ctx.copyEntries.map((entry) => ({
          value: entry.name,
          label: entry.name,
          hint: entry.text.trim() ? `${entry.text.trim().length} chars` : 'empty',
        })),
      ]
    },
    resolveItems: (ctx, ref, nestPath) => {
      if (ref === COPY_STORE_ALL_REF) {
        return ctx.copyEntries.map((entry) => entry.text)
      }
      const entry = ctx.copyEntries.find((item) => item.name === ref)
      if (!entry) return []
      const root = parseFlexibleData(entry.text)
      const path = String(nestPath ?? '').trim() || '$'
      return resolveJsonPathToArray(root, path)
    },
  },
]

function resolveDatasetData(ctx: MapArraySourceContext, id: string): unknown {
  const dataset = ctx.datasets.find((item) => item.id === id)
  if (dataset) return dataset.data
  const section = ctx.customSections.find((item) => item.id === id)
  return section?.data
}

function datasetToSource(dataset: PlanDataset): MapArraySourceDefinition {
  return {
    id: datasetSourceId(dataset.id),
    labelEn: dataset.name,
    labelBn: dataset.name,
    emptyEn: `No lists found in “${dataset.name}”. Add a list in Datasets.`,
    emptyBn: `“${dataset.name}”-এ কোনো লিস্ট নেই। Datasets-এ একটি list যোগ করুন।`,
    listOptions: (ctx) => {
      const live = ctx.datasets.find((item) => item.id === dataset.id) ?? dataset
      if (live.kind === 'textLibrary') {
        const items = extractTextItems(live.data)
        return [
          {
            value: 'items',
            label: 'Titles',
            hint: `${items.length} item${items.length === 1 ? '' : 's'}`,
          },
        ]
      }
      return discoverJsonArrayPaths(live.data)
    },
    resolveItems: (ctx, ref) => {
      const live = ctx.datasets.find((item) => item.id === dataset.id) ?? dataset
      if (live.kind === 'textLibrary' && (ref === 'items' || ref === '$' || !ref)) {
        return extractTextItems(live.data).map((item) => item.title)
      }
      return resolveJsonPathToArray(live.data, ref || '$')
    },
  }
}

/** Legacy section:* ids resolve against datasets first, then customSections. */
function legacySectionToSource(sectionId: string, label: string): MapArraySourceDefinition {
  return {
    id: customSectionSourceId(sectionId),
    labelEn: label,
    labelBn: label,
    emptyEn: `No lists found in “${label}”.`,
    emptyBn: `“${label}”-এ কোনো লিস্ট নেই।`,
    listOptions: (ctx) => {
      const data = resolveDatasetData(ctx, sectionId)
      if (data === undefined) return []
      const ds = ctx.datasets.find((item) => item.id === sectionId)
      if (ds?.kind === 'textLibrary') {
        const items = extractTextItems(ds.data)
        return [{ value: 'items', label: 'Titles', hint: `${items.length} items` }]
      }
      return discoverJsonArrayPaths(data)
    },
    resolveItems: (ctx, ref) => {
      const ds = ctx.datasets.find((item) => item.id === sectionId)
      if (ds?.kind === 'textLibrary' && (ref === 'items' || ref === '$' || !ref)) {
        return extractTextItems(ds.data).map((item) => item.title)
      }
      const data = resolveDatasetData(ctx, sectionId)
      if (data === undefined) return []
      return resolveJsonPathToArray(data, ref || '$')
    },
  }
}

/** Built-ins + Datasets (+ legacy section:* aliases). */
export function getMapArraySources(
  ctx: MapArraySourceContext,
  options?: { keepSourceId?: string },
): MapArraySourceDefinition[] {
  const keep = options?.keepSourceId
  const builtins = MAP_ARRAY_SOURCES.filter((source) => {
    // Keep currently selected built-in so existing graphs don't break
    if (keep && source.id === keep) return true
    if (source.id === 'textLibrary') return ctx.textLibraries.length > 0
    if (source.id === 'copyStore') return ctx.copyEntries.length > 0
    return true
  })
  const datasetSources = ctx.datasets.map(datasetToSource)
  const datasetIds = new Set(ctx.datasets.map((item) => item.id))
  // Orphan legacy sections not yet in datasets (rare)
  const orphanSections = ctx.customSections
    .filter((section) => !datasetIds.has(section.id))
    .map((section) => legacySectionToSource(section.id, section.title))

  // Prefer dataset:* in the dropdown; section:* still resolvable via getMapArraySource
  return [...builtins, ...datasetSources, ...orphanSections]
}

export function getMapArraySource(
  id: string | undefined,
  ctx?: MapArraySourceContext,
): MapArraySourceDefinition | undefined {
  if (!id) return undefined
  const builtin = MAP_ARRAY_SOURCES.find((source) => source.id === id)
  if (builtin) return builtin
  if (ctx) {
    const fromList = getMapArraySources(ctx, { keepSourceId: id }).find(
      (source) => source.id === id,
    )
    if (fromList) return fromList
    // Resolve dataset:/section: even if not in the primary list (aliases)
    const datasetId = parseDatasetSourceId(id) ?? parseCustomSectionSourceId(id)
    if (datasetId) {
      const ds = ctx.datasets.find((item) => item.id === datasetId)
      if (ds) {
        return id.startsWith('section:')
          ? legacySectionToSource(ds.id, ds.name)
          : datasetToSource(ds)
      }
      const section = ctx.customSections.find((item) => item.id === datasetId)
      if (section) return legacySectionToSource(section.id, section.title)
    }
  }
  if (parseDatasetSourceId(id) || parseCustomSectionSourceId(id)) {
    return {
      id,
      labelEn: 'Dataset',
      labelBn: 'ডেটাসেট',
      emptyEn: 'No lists in this dataset yet.',
      emptyBn: 'এই ডেটাসেটে এখনো কোনো লিস্ট নেই।',
      listOptions: () => [],
      resolveItems: () => [],
    }
  }
  return undefined
}

export function readLiveCopyStore(
  variables: Record<string, unknown>,
  workflowId?: string,
): WorkflowCopyStore {
  if (!workflowId) return {}
  const fromMap = variables.copyStores
  if (fromMap && typeof fromMap === 'object') {
    const slice = (fromMap as Record<string, unknown>)[workflowId]
    if (isWorkflowCopyStore(slice)) return slice
  }
  if (isWorkflowCopyStore(variables.copyStore)) return variables.copyStore
  return {}
}

export async function loadPlanCustomSections(planId?: string): Promise<PlanCustomSection[]> {
  if (!planId) return []
  const workspace = await storageGet<{ plans?: AutomationPlan[] }>('planner-workspace', {
    plans: [],
  })
  const plan = (workspace.plans ?? []).find((item) => item.id === planId)
  return plan?.customSections ?? []
}

export async function loadPlanDatasets(planId?: string): Promise<PlanDataset[]> {
  if (!planId) return []
  const workspace = await storageGet<{ plans?: AutomationPlan[] }>('planner-workspace', {
    plans: [],
  })
  const plan = (workspace.plans ?? []).find((item) => item.id === planId)
  return plan?.datasets ?? []
}

/** Load libraries + copy entries + datasets for the current workflow/plan. */
export async function loadMapArrayContext(args: {
  planId?: string
  workflowId?: string
  variables?: Record<string, unknown>
  customSections?: PlanCustomSection[]
  datasets?: PlanDataset[]
}): Promise<MapArraySourceContext> {
  const variables = args.variables ?? {}
  const textLibraries = await loadPlanTextLibraries(args.planId)
  const customSections =
    args.customSections ?? (await loadPlanCustomSections(args.planId))
  const datasets = args.datasets ?? (await loadPlanDatasets(args.planId))
  let copyEntries: CopyStoreEntry[] = []
  if (args.workflowId) {
    const durable = await loadDurableWorkflowStore(args.workflowId)
    const live = readLiveCopyStore(variables, args.workflowId)
    copyEntries = mergeStoresForDisplay(durable, live)
  } else {
    copyEntries = list({})
  }
  return {
    planId: args.planId,
    workflowId: args.workflowId,
    variables,
    textLibraries,
    copyEntries,
    customSections,
    datasets,
  }
}

/**
 * Resolve the array Map will iterate.
 * Prefers collectionSource + collectionRef; falls back to legacy collectionKey variable lookup.
 */
export async function resolveMapArrayItems(args: {
  params: Record<string, unknown>
  planId?: string
  workflowId?: string
  variables: Record<string, unknown>
}): Promise<{ items: unknown[]; sourceLabel: string; refLabel: string }> {
  const sourceId = String(args.params.collectionSource ?? '').trim()
  const ref = String(args.params.collectionRef ?? '').trim()

  const ctx = await loadMapArrayContext({
    planId: args.planId,
    workflowId: args.workflowId,
    variables: args.variables,
  })
  const source = getMapArraySource(sourceId, ctx)

  if (source && ref) {
    const nestPath = String(args.params.collectionPath ?? '').trim() || undefined
    const option = source.listOptions(ctx).find((item) => item.value === ref)
    const nestOptions =
      source.supportsNestPath && nestPath
        ? listNestPathOptions(getCopyStoreEntryRoot(ctx, ref))
        : []
    const nestLabel = nestOptions.find((item) => item.value === nestPath)?.label
    const items = source.resolveItems(ctx, ref, nestPath)
    return {
      items,
      sourceLabel: source.labelEn,
      refLabel: nestLabel ? `${option?.label ?? ref} → ${nestLabel}` : (option?.label ?? ref),
    }
  }

  // Legacy / variable fallback
  const collectionKey = String(args.params.collectionKey ?? '').trim()
  if (collectionKey) {
    return {
      items: resolveCollection(args.variables, collectionKey),
      sourceLabel: 'Variable',
      refLabel: collectionKey,
    }
  }

  return { items: [], sourceLabel: '', refLabel: '' }
}
