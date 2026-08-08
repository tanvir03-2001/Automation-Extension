/**
 * Plan-level Dataset helpers — unique names, migration, TypeText dual-write.
 */

import { nanoid } from 'nanoid'
import type {
  AutomationPlan,
  PlanCustomSection,
  PlanDataset,
  PlanDatasetKind,
  PlanTextItem,
  PlanTextLibrary,
} from '@/planner/types/plan'

export const DATASET_SOURCE_PREFIX = 'dataset:'

export function datasetSourceId(datasetId: string): string {
  return `${DATASET_SOURCE_PREFIX}${datasetId}`
}

export function parseDatasetSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(DATASET_SOURCE_PREFIX)) return null
  return sourceId.slice(DATASET_SOURCE_PREFIX.length) || null
}

/** Normalize for uniqueness checks (trim + case-insensitive). */
export function normalizeDatasetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isValidDatasetName(name: string): boolean {
  return name.trim().length > 0
}

export function findDatasetNameConflict(
  datasets: PlanDataset[],
  name: string,
  excludeId?: string,
): PlanDataset | undefined {
  const key = normalizeDatasetName(name)
  if (!key) return undefined
  return datasets.find(
    (item) => item.id !== excludeId && normalizeDatasetName(item.name) === key,
  )
}

export function extractTextItems(data: unknown): PlanTextItem[] {
  if (!data || typeof data !== 'object') return []
  const items = (data as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items
    .map((row, index) => {
      if (!row || typeof row !== 'object') {
        const title = String(row ?? '').trim()
        if (!title) return null
        return { id: `ti_${index}`, title, text: title }
      }
      const obj = row as Record<string, unknown>
      const title = String(obj.title ?? obj.text ?? '').trim()
      if (!title) return null
      return {
        id: String(obj.id ?? `ti_${index}`),
        title,
        text: String(obj.text ?? title),
      }
    })
    .filter((item): item is PlanTextItem => !!item)
}

export function textLibraryToDataset(lib: PlanTextLibrary): PlanDataset {
  return {
    id: lib.id,
    name: lib.name,
    description: 'Text library (TypeText)',
    data: { items: lib.items },
    kind: 'textLibrary',
    updatedAt: lib.updatedAt,
  }
}

export function customSectionToDataset(section: PlanCustomSection): PlanDataset {
  return {
    id: section.id,
    name: section.title,
    description: section.description,
    data: section.data,
    kind: 'legacyCustomSection',
    updatedAt: section.updatedAt,
  }
}

export function datasetToTextLibrary(dataset: PlanDataset): PlanTextLibrary | null {
  if (dataset.kind !== 'textLibrary') return null
  return {
    id: dataset.id,
    name: dataset.name,
    items: extractTextItems(dataset.data),
    updatedAt: dataset.updatedAt,
  }
}

/** Ensure unique display name within a list (appends " (2)", …). */
function uniquifyName(base: string, used: Set<string>): string {
  const trimmed = base.trim() || 'Untitled'
  const key = normalizeDatasetName(trimmed)
  if (!used.has(key)) {
    used.add(key)
    return trimmed
  }
  let n = 2
  while (used.has(normalizeDatasetName(`${trimmed} (${n})`))) n += 1
  const next = `${trimmed} (${n})`
  used.add(normalizeDatasetName(next))
  return next
}

/**
 * Build datasets from legacy fields when `datasets` is missing/empty.
 * Preserves ids so Map `section:{id}` refs keep working after migration.
 */
export function migratePlanDatasets(plan: AutomationPlan): PlanDataset[] {
  if (Array.isArray(plan.datasets) && plan.datasets.length > 0) {
    return plan.datasets
  }

  const used = new Set<string>()
  const out: PlanDataset[] = []

  for (const section of plan.customSections ?? []) {
    const name = uniquifyName(section.title || 'Section', used)
    out.push({
      ...customSectionToDataset(section),
      name,
    })
  }

  for (const lib of plan.textLibraries ?? []) {
    // Prefer keeping text-library id; rename if collision with a section
    const conflict = out.some((d) => normalizeDatasetName(d.name) === normalizeDatasetName(lib.name))
    const name = conflict ? uniquifyName(lib.name || 'Text list', used) : uniquifyName(lib.name || 'Text list', used)
    out.push({
      ...textLibraryToDataset(lib),
      name,
    })
  }

  return out
}

/** Normalize a plan for hydrate/import — datasets + legacy arrays always present. */
export function normalizePlanData(plan: AutomationPlan): AutomationPlan {
  const textLibraries = plan.textLibraries ?? []
  const customSections = plan.customSections ?? []
  const datasets = migratePlanDatasets({ ...plan, textLibraries, customSections })
  return {
    ...plan,
    textLibraries,
    customSections,
    datasets,
  }
}

export function createEmptyDataset(args: {
  name: string
  description?: string
  kind?: PlanDatasetKind
  data?: unknown
}): PlanDataset {
  const kind = args.kind ?? 'custom'
  const now = new Date().toISOString()
  const fallback = kind === 'textLibrary' ? { items: [] } : {}
  return {
    id: `ds_${nanoid(8)}`,
    name: args.name.trim(),
    description: (args.description ?? '').trim() || undefined,
    data: args.data !== undefined ? args.data : fallback,
    kind,
    updatedAt: now,
  }
}

/** Sync textLibraries array from datasets (textLibrary kind only). */
export function syncTextLibrariesFromDatasets(
  datasets: PlanDataset[],
  previous: PlanTextLibrary[],
): PlanTextLibrary[] {
  const fromDatasets = datasets
    .map(datasetToTextLibrary)
    .filter((item): item is PlanTextLibrary => !!item)

  // Keep any legacy libraries that somehow aren't mirrored (shouldn't happen)
  const ids = new Set(fromDatasets.map((item) => item.id))
  const orphans = previous.filter((lib) => !ids.has(lib.id))
  return [...fromDatasets, ...orphans]
}

/** After Text Library panel upsert — mirror into datasets. */
export function upsertDatasetFromTextLibrary(
  datasets: PlanDataset[],
  library: PlanTextLibrary,
): PlanDataset[] {
  const asDataset = textLibraryToDataset(library)
  const exists = datasets.some((item) => item.id === library.id)
  if (exists) {
    return datasets.map((item) => (item.id === library.id ? asDataset : item))
  }
  // Name clash with another dataset → keep library name uniqueness via suffix
  const clash = findDatasetNameConflict(datasets, library.name)
  if (clash && clash.id !== library.id) {
    asDataset.name = uniquifyName(library.name, new Set(datasets.map((d) => normalizeDatasetName(d.name))))
  }
  return [...datasets, asDataset]
}

export function removeDatasetById(datasets: PlanDataset[], id: string): PlanDataset[] {
  return datasets.filter((item) => item.id !== id)
}
