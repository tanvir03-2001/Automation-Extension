import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Eraser, Eye, Trash2 } from 'lucide-react'
import { usePlannerStore } from '@/planner/store/planner-store'
import {
  DURABLE_COPY_STORES_KEY,
  formatClipboardPayload,
  isWorkflowCopyStore,
  loadDurableWorkflowStore,
  mergeStoresForDisplay,
} from '@/engine/copy-store'
import type { CopyStoreEntry, WorkflowCopyStore } from '@/engine/copy-store'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface CopyStorePanelProps {
  workflowId: string | null
  compact?: boolean
}

function previewText(text: string, max = 72): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max)}…`
}

/** Pretty view for Copy Store eye/preview — nested JSON is expanded, not escaped. */
function formatEntryForView(entry: CopyStoreEntry): string {
  const tryParse = (raw: string): unknown => {
    const trimmed = raw.trim()
    if (!trimmed) return raw
    try {
      return JSON.parse(trimmed)
    } catch {
      return raw
    }
  }

  if (entry.format === 'json') {
    const textValue = tryParse(entry.text)
    return JSON.stringify(
      {
        name: entry.name,
        text: textValue,
      },
      null,
      2,
    )
  }

  const parsed = tryParse(entry.text)
  if (typeof parsed === 'object' && parsed !== null) {
    return JSON.stringify(parsed, null, 2)
  }
  return entry.text
}

export function CopyStorePanel({ workflowId, compact }: CopyStorePanelProps) {
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const [durable, setDurable] = useState<WorkflowCopyStore>({})
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const liveStore = useMemo((): WorkflowCopyStore => {
    if (!workflowId || !checkpoint) return {}
    if (checkpoint.workflowId !== workflowId && !checkpoint.variables.copyStores) {
      return {}
    }
    const fromMap = checkpoint.variables.copyStores
    if (fromMap && typeof fromMap === 'object') {
      const slice = (fromMap as Record<string, unknown>)[workflowId]
      if (isWorkflowCopyStore(slice)) return slice
    }
    if (checkpoint.workflowId === workflowId && isWorkflowCopyStore(checkpoint.variables.copyStore)) {
      return checkpoint.variables.copyStore
    }
    return {}
  }, [checkpoint, workflowId])

  const refresh = useCallback(async () => {
    if (!workflowId) {
      setDurable({})
      return
    }
    const store = await loadDurableWorkflowStore(workflowId)
    setDurable(store)
  }, [workflowId])

  useEffect(() => {
    void refresh()
  }, [refresh, checkpoint?.updatedAt])

  useEffect(() => {
    const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return
      if (!Object.prototype.hasOwnProperty.call(changes, `ae:${DURABLE_COPY_STORES_KEY}`)) return
      void refresh()
    }
    chrome.storage.onChanged.addListener(onStorage)
    return () => chrome.storage.onChanged.removeListener(onStorage)
  }, [refresh])

  const entries = useMemo(
    () => mergeStoresForDisplay(durable, liveStore),
    [durable, liveStore],
  )

  async function removeEntry(name: string) {
    if (!workflowId) return
    if (!window.confirm(`Delete copied item “${name}” from Copy Store?`)) return
    setBusy(true)
    try {
      const response = await sendRuntimeMessage<{
        ok: boolean
        error?: string
        store?: WorkflowCopyStore
        checkpoint?: typeof checkpoint
      }>({
        type: 'PLANNER_COPY_STORE_DELETE',
        payload: { workflowId, name },
      })
      if (!response.ok) {
        window.alert(response.error ?? 'Delete failed')
        return
      }
      setDurable(response.store ?? {})
      if (response.checkpoint !== undefined) {
        usePlannerStore.getState().setCheckpoint(response.checkpoint)
      }
      if (expandedName === name) setExpandedName(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function clearAll() {
    if (!workflowId || entries.length === 0) return
    if (!window.confirm(`Clear all ${entries.length} Copy Store item(s) for this workflow?`)) return
    setBusy(true)
    try {
      const response = await sendRuntimeMessage<{
        ok: boolean
        error?: string
        store?: WorkflowCopyStore
        checkpoint?: typeof checkpoint
      }>({
        type: 'PLANNER_COPY_STORE_CLEAR',
        payload: { workflowId },
      })
      if (!response.ok) {
        window.alert(response.error ?? 'Clear failed')
        return
      }
      setDurable({})
      if (response.checkpoint !== undefined) {
        usePlannerStore.getState().setCheckpoint(response.checkpoint)
      }
      setExpandedName(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function copyAgain(entry: CopyStoreEntry) {
    const payload = formatClipboardPayload(entry.name, entry.text, entry.format)
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      window.alert('Clipboard write failed in dashboard — open the page tab if needed.')
    }
  }

  if (!workflowId) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <p className="font-display text-lg font-semibold">Copy Store</p>
        <p className="mt-2 text-sm text-muted-foreground">Select a workflow first.</p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-border/80 bg-card text-card-foreground shadow-panel ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <ClipboardCopy className="h-4 w-4 text-primary" />
            Copy Store
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy Event দিয়ে save হওয়া text/JSON এখানে থাকে (Text libraries-এর মতো)। পরে{' '}
            <span className="font-mono text-[11px] text-foreground">{'{{COPY:story-1}}'}</span>{' '}
            দিয়ে ব্যবহার করুন।
          </p>
          {workflow ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Workflow: <span className="font-medium text-foreground">{workflow.name}</span>
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 rounded-xl"
          disabled={busy || entries.length === 0}
          onClick={() => void clearAll()}
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            এখনো কিছু copy save হয়নি। Builder-এ <span className="font-medium text-foreground">Copy Event</span>{' '}
            চালান — <span className="font-mono text-[11px]">story-1</span>,{' '}
            <span className="font-mono text-[11px]">story-2</span>… এখানে দেখা যাবে।
          </p>
        ) : (
          entries.map((entry) => {
            const open = expandedName === entry.name
            return (
              <div
                key={entry.id || entry.name}
                className="rounded-xl border border-border px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-foreground">
                      {entry.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {previewText(entry.text)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="secondary">{entry.format}</Badge>
                    <Badge variant="outline">#{entry.number}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg p-0"
                      title="Preview"
                      onClick={() => setExpandedName(open ? null : entry.name)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg p-0"
                      title="Copy again"
                      onClick={() => void copyAgain(entry)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg p-0 text-destructive"
                      disabled={busy}
                      title="Delete"
                      onClick={() => void removeEntry(entry.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {open ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {formatEntryForView(entry)}
                  </pre>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
