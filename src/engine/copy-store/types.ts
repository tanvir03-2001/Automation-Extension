export type CopyFormat = 'text' | 'json'

export interface CopyStoreEntry {
  id: string
  workflowId: string
  name: string
  prefix: string
  number: number
  text: string
  format: CopyFormat
  createdAt: string
}

/** Per-workflow map: entry name → entry */
export type WorkflowCopyStore = Record<string, CopyStoreEntry>

/** All workflow copy stores keyed by workflowId (run-scoped, lives in checkpoint.variables) */
export type CopyStoresMap = Record<string, WorkflowCopyStore>

export interface CopyCreateInput {
  workflowId: string
  /** Name template, e.g. story-{_NumberAuto} or static my-name */
  name: string
  text: string
  format?: CopyFormat
  /** Extra placeholder context for future tokens */
  placeholderContext?: Record<string, string | number>
}

export interface CopyCreateResult {
  entry: CopyStoreEntry
  /** Payload written / intended for clipboard */
  clipboardPayload: string
  store: WorkflowCopyStore
  copyStores: CopyStoresMap
}
