import { createId } from '@/shared/utils/id'
import { saveDurableWorkflowStore } from './durable'
import { applyPlaceholders, extractPrefix, hasNumberAuto } from './placeholders'
import type {
  CopyCreateInput,
  CopyCreateResult,
  CopyFormat,
  CopyStoreEntry,
  CopyStoresMap,
  WorkflowCopyStore,
} from './types'

const COPY_STORE_KEY = 'copyStore'
const COPY_STORES_KEY = 'copyStores'

/** Authoritative in-run stores (survives rapid create before checkpoint merge). */
const runtimeStores = new Map<string, WorkflowCopyStore>()

/** Per-workflow async mutex so rapid create() calls never share a number. */
const lockChains = new Map<string, Promise<unknown>>()

function withWorkflowLock<T>(workflowId: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = lockChains.get(workflowId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  lockChains.set(
    workflowId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

export function isWorkflowCopyStore(value: unknown): value is WorkflowCopyStore {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isCopyStoresMap(value: unknown): value is CopyStoresMap {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Read all workflow stores from run variables. */
export function readCopyStores(variables: Record<string, unknown>): CopyStoresMap {
  const raw = variables[COPY_STORES_KEY]
  if (isCopyStoresMap(raw)) {
    const out: CopyStoresMap = {}
    for (const [wfId, store] of Object.entries(raw)) {
      if (isWorkflowCopyStore(store)) out[wfId] = { ...store }
    }
    return out
  }
  const single = variables[COPY_STORE_KEY]
  if (isWorkflowCopyStore(single)) {
    const first = Object.values(single)[0]
    if (first?.workflowId) {
      return { [first.workflowId]: { ...single } }
    }
  }
  return {}
}

/** Current workflow's store (runtime → variables mirror). */
export function readWorkflowCopyStore(
  variables: Record<string, unknown>,
  workflowId?: string,
): WorkflowCopyStore {
  if (workflowId && runtimeStores.has(workflowId)) {
    return { ...runtimeStores.get(workflowId)! }
  }
  const stores = readCopyStores(variables)
  if (workflowId && stores[workflowId]) return { ...stores[workflowId] }
  const mirror = variables[COPY_STORE_KEY]
  if (isWorkflowCopyStore(mirror)) return { ...mirror }
  return {}
}

/** Hydrate runtime from checkpoint variables (pause/resume). */
export function hydrateRuntime(variables: Record<string, unknown>): void {
  const stores = readCopyStores(variables)
  for (const [wfId, store] of Object.entries(stores)) {
    const existing = runtimeStores.get(wfId) ?? {}
    runtimeStores.set(wfId, { ...store, ...existing, ...store })
  }
  const mirror = variables[COPY_STORE_KEY]
  if (isWorkflowCopyStore(mirror)) {
    const first = Object.values(mirror)[0]
    const wfId = first?.workflowId
    if (wfId) {
      runtimeStores.set(wfId, { ...(runtimeStores.get(wfId) ?? {}), ...mirror })
    }
  }
}

/** Clear runtime for a workflow (fresh run). */
export function resetRuntime(workflowId: string): void {
  runtimeStores.delete(workflowId)
}

export function resetAllRuntime(): void {
  runtimeStores.clear()
}

/** Remove one entry from in-memory runtime (UI delete). */
export function removeFromRuntime(workflowId: string, name: string): WorkflowCopyStore {
  const current = runtimeStores.get(workflowId) ?? {}
  if (!current[name]) return { ...current }
  const next = { ...current }
  delete next[name]
  runtimeStores.set(workflowId, next)
  return next
}

/** Replace runtime store snapshot (after durable delete/clear). */
export function setRuntimeStore(workflowId: string, store: WorkflowCopyStore): void {
  runtimeStores.set(workflowId, { ...store })
}

export function getNextNumber(store: WorkflowCopyStore, prefix: string): number {
  let highest = 0
  for (const entry of Object.values(store)) {
    if (entry.prefix !== prefix) continue
    if (typeof entry.number === 'number' && entry.number > highest) {
      highest = entry.number
    }
  }
  return highest + 1
}

export function exists(store: WorkflowCopyStore, name: string): boolean {
  return Boolean(store[name])
}

export function getByName(store: WorkflowCopyStore, name: string): CopyStoreEntry | undefined {
  return store[name]
}

export function get(store: WorkflowCopyStore, id: string): CopyStoreEntry | undefined {
  return Object.values(store).find((entry) => entry.id === id)
}

export function list(store: WorkflowCopyStore): CopyStoreEntry[] {
  return Object.values(store).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number,
  )
}

export function formatClipboardPayload(name: string, text: string, format: CopyFormat): string {
  if (format === 'json') {
    return JSON.stringify({ name, text })
  }
  return text
}

function resolveStaticNumber(name: string, prefix: string): number {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = name.match(new RegExp(`^${escaped}-(\\d+)$`))
  if (match) return Number(match[1])
  return 0
}

function mergeStore(a: WorkflowCopyStore, b: WorkflowCopyStore): WorkflowCopyStore {
  return { ...a, ...b }
}

/**
 * Create a copy-store entry with atomic numbering for the workflow+prefix series.
 */
export async function create(
  variables: Record<string, unknown>,
  input: CopyCreateInput,
): Promise<CopyCreateResult> {
  const workflowId = input.workflowId
  const format: CopyFormat = input.format === 'json' ? 'json' : 'text'

  const result = await withWorkflowLock(workflowId, () => {
    const fromVars = readCopyStores(variables)
    const varStore = fromVars[workflowId] ?? {}
    const memStore = runtimeStores.get(workflowId) ?? {}
    const store: WorkflowCopyStore = mergeStore(varStore, memStore)

    const template = String(input.name ?? '').trim() || 'copy-{_NumberAuto}'
    const prefix = extractPrefix(template)
    const numberAuto = hasNumberAuto(template) ? getNextNumber(store, prefix) : 0

    const resolvedName = hasNumberAuto(template)
      ? applyPlaceholders(template, {
          numberAuto,
          workflowId,
          index: numberAuto,
          extra: input.placeholderContext,
        })
      : applyPlaceholders(template, {
          numberAuto: resolveStaticNumber(template, prefix) || 1,
          workflowId,
          extra: input.placeholderContext,
        })

    const existing = store[resolvedName]
    const number = hasNumberAuto(template)
      ? numberAuto
      : (existing?.number ?? resolveStaticNumber(resolvedName, prefix))

    const entry: CopyStoreEntry = {
      id: existing?.id ?? createId('copy'),
      workflowId,
      name: resolvedName,
      prefix,
      number,
      text: input.text,
      format,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    store[resolvedName] = entry
    runtimeStores.set(workflowId, store)

    const copyStores: CopyStoresMap = { ...fromVars, ...readCopyStores(variables), [workflowId]: store }

    // Keep caller variables in sync for same-tick rapid creates
    variables[COPY_STORE_KEY] = store
    variables[COPY_STORES_KEY] = copyStores

    return {
      entry,
      clipboardPayload: formatClipboardPayload(entry.name, entry.text, format),
      store,
      copyStores,
    }
  })

  // Persist like Text libraries — survives runs and shows in Planner UI
  try {
    await saveDurableWorkflowStore(workflowId, result.store)
  } catch {
    // Non-fatal: run variables still hold the entry for this session
  }

  return result
}

export function update(
  store: WorkflowCopyStore,
  name: string,
  patch: Partial<Pick<CopyStoreEntry, 'text' | 'format'>>,
): WorkflowCopyStore {
  const current = store[name]
  if (!current) return store
  return {
    ...store,
    [name]: {
      ...current,
      ...patch,
    },
  }
}

export function remove(store: WorkflowCopyStore, name: string): WorkflowCopyStore {
  if (!store[name]) return store
  const next = { ...store }
  delete next[name]
  return next
}

export function clearWorkflow(copyStores: CopyStoresMap, workflowId: string): CopyStoresMap {
  runtimeStores.delete(workflowId)
  const next = { ...copyStores }
  delete next[workflowId]
  return next
}

/**
 * Resolve {{COPY:*}} style references against the current workflow copy store.
 * Returns undefined if the path is not a copy reference.
 */
export function resolveCopyReference(
  path: string,
  variables: Record<string, unknown>,
  workflowId?: string,
): string | undefined {
  const trimmed = path.trim()

  const named = trimmed.match(/^(COPY_NAME|COPY_NUMBER|COPY):(.+)$/i)
  if (!named) return undefined

  const kind = named[1].toUpperCase()
  const rest = named[2].trim()

  let entryName = rest
  let field: 'text' | 'name' | 'number' | undefined

  const dotted = rest.match(/^(.+?)\.(text|name|number)$/i)
  if (dotted) {
    entryName = dotted[1]
    field = dotted[2].toLowerCase() as 'text' | 'name' | 'number'
  }

  const effectiveWorkflowId =
    workflowId ||
    (typeof variables.__workflowId === 'string' ? variables.__workflowId : undefined)

  const store = readWorkflowCopyStore(variables, effectiveWorkflowId)
  let entry = store[entryName]

  if (!entry) {
    const all = { ...readCopyStores(variables) }
    for (const [wfId, mem] of runtimeStores) {
      all[wfId] = { ...(all[wfId] ?? {}), ...mem }
    }
    for (const wfStore of Object.values(all)) {
      if (wfStore[entryName]) {
        entry = wfStore[entryName]
        break
      }
    }
  }

  if (!entry) return ''

  if (kind === 'COPY_NAME') return entry.name
  if (kind === 'COPY_NUMBER') return String(entry.number)

  if (field === 'name') return entry.name
  if (field === 'number') return String(entry.number)
  return entry.text
}

/** Build variable patch after a successful create (merge into checkpoint.variables). */
export function toVariablesPatch(result: CopyCreateResult): Record<string, unknown> {
  return {
    [COPY_STORE_KEY]: result.store,
    [COPY_STORES_KEY]: result.copyStores,
    __lastCopyName: result.entry.name,
    __lastCopyText: result.entry.text,
  }
}

/** Sync variables.copyStore mirror for the active workflow (nested jump). */
export function syncActiveCopyStoreMirror(
  variables: Record<string, unknown>,
  workflowId: string,
): void {
  const stores = readCopyStores(variables)
  const store = runtimeStores.get(workflowId) ?? stores[workflowId] ?? {}
  variables[COPY_STORE_KEY] = store
  variables[COPY_STORES_KEY] = { ...stores, [workflowId]: store }
  variables.__workflowId = workflowId
}

export const copyStore = {
  create,
  get,
  getByName,
  exists,
  getNextNumber,
  list,
  update,
  delete: remove,
  clearWorkflow,
  readCopyStores,
  readWorkflowCopyStore,
  resolveCopyReference,
  formatClipboardPayload,
  toVariablesPatch,
  hydrateRuntime,
  resetRuntime,
  resetAllRuntime,
  removeFromRuntime,
  setRuntimeStore,
  syncActiveCopyStoreMirror,
  keys: {
    copyStore: COPY_STORE_KEY,
    copyStores: COPY_STORES_KEY,
  },
}
