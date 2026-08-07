import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import { isWorkflowCopyStore, list } from './copy-store'
import type { CopyStoresMap, CopyStoreEntry, WorkflowCopyStore } from './types'

/** Durable library of Copy Event results — survives runs like Text libraries. */
export const DURABLE_COPY_STORES_KEY = 'workflow-copy-stores'

export async function loadDurableCopyStores(): Promise<CopyStoresMap> {
  const raw = await storageGet<CopyStoresMap>(DURABLE_COPY_STORES_KEY, {})
  if (!raw || typeof raw !== 'object') return {}
  const out: CopyStoresMap = {}
  for (const [wfId, store] of Object.entries(raw)) {
    if (isWorkflowCopyStore(store)) out[wfId] = { ...store }
  }
  return out
}

export async function loadDurableWorkflowStore(workflowId: string): Promise<WorkflowCopyStore> {
  const all = await loadDurableCopyStores()
  return { ...(all[workflowId] ?? {}) }
}

export async function saveDurableWorkflowStore(
  workflowId: string,
  store: WorkflowCopyStore,
): Promise<void> {
  const all = await loadDurableCopyStores()
  all[workflowId] = { ...store }
  await storageSet(DURABLE_COPY_STORES_KEY, all)
}

export async function deleteDurableEntry(
  workflowId: string,
  name: string,
): Promise<WorkflowCopyStore> {
  const store = await loadDurableWorkflowStore(workflowId)
  if (!store[name]) return store
  const next = { ...store }
  delete next[name]
  await saveDurableWorkflowStore(workflowId, next)
  return next
}

export async function clearDurableWorkflowStore(workflowId: string): Promise<void> {
  const all = await loadDurableCopyStores()
  delete all[workflowId]
  await storageSet(DURABLE_COPY_STORES_KEY, all)
}

export async function listDurableEntries(workflowId: string): Promise<CopyStoreEntry[]> {
  const store = await loadDurableWorkflowStore(workflowId)
  return list(store)
}

/** Merge durable + live store for display (live wins on same name). */
export function mergeStoresForDisplay(
  durable: WorkflowCopyStore,
  live?: WorkflowCopyStore | null,
): CopyStoreEntry[] {
  return list({ ...durable, ...(live ?? {}) })
}
