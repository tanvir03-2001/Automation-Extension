import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileJson, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlannerStore } from '@/planner/store/planner-store'
import { downloadJson, pickJsonFile, readJsonFile } from '@/planner/io/export-import'
import { cn } from '@/shared/utils/cn'

type Scope = 'workspace' | 'plan' | 'workflow' | 'snippet'

export function ImportExportMenu({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedPlanId = usePlannerStore((s) => s.selectedPlanId)
  const selectedWorkflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const selectedNodeId = usePlannerStore((s) => s.selectedNodeId)
  const exportWorkspacePayload = usePlannerStore((s) => s.exportWorkspacePayload)
  const exportPlanPayload = usePlannerStore((s) => s.exportPlanPayload)
  const exportWorkflowPayload = usePlannerStore((s) => s.exportWorkflowPayload)
  const exportSnippetPayload = usePlannerStore((s) => s.exportSnippetPayload)
  const importPayload = usePlannerStore((s) => s.importPayload)

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function onExport(scope: Scope) {
    try {
      if (scope === 'workspace') {
        downloadJson('workspace.json', exportWorkspacePayload())
      } else if (scope === 'plan') {
        if (!selectedPlanId) throw new Error('Select a plan first')
        downloadJson(`plan-${selectedPlanId}.json`, exportPlanPayload(selectedPlanId))
      } else if (scope === 'workflow') {
        if (!selectedWorkflowId) throw new Error('Select a workflow first')
        downloadJson(`workflow-${selectedWorkflowId}.json`, exportWorkflowPayload(selectedWorkflowId))
      } else {
        if (!selectedWorkflowId) throw new Error('Select a workflow first')
        const nodeIds = selectedNodeId ? [selectedNodeId] : undefined
        downloadJson(
          `snippet-${selectedWorkflowId}.json`,
          exportSnippetPayload(selectedWorkflowId, nodeIds),
        )
      }
      setMessage('Export downloaded ✓')
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function onImport(mode: 'merge' | 'replace') {
    try {
      const file = await pickJsonFile()
      if (!file) return
      const raw = await readJsonFile(file)
      const result = await importPayload(raw, mode)
      setMessage(result)
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const panel =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999] w-72 rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Export (download JSON)
            </p>
            <MenuItem onClick={() => void onExport('workspace')}>
              <Download className="h-3.5 w-3.5" />
              Full workspace
            </MenuItem>
            <MenuItem onClick={() => void onExport('plan')}>
              <Download className="h-3.5 w-3.5" />
              Current plan (+ text libraries)
            </MenuItem>
            <MenuItem onClick={() => void onExport('workflow')}>
              <Download className="h-3.5 w-3.5" />
              Current workflow only
            </MenuItem>
            <MenuItem onClick={() => void onExport('snippet')}>
              <Download className="h-3.5 w-3.5" />
              {selectedNodeId ? 'Selected step snippet' : 'Workflow as snippet'}
            </MenuItem>

            <div className="my-2 h-px bg-[hsl(var(--border))]" />
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Import (load JSON file)
            </p>
            <MenuItem onClick={() => void onImport('merge')}>
              <Upload className="h-3.5 w-3.5" />
              Merge into workspace
            </MenuItem>
            <MenuItem onClick={() => void onImport('replace')}>
              <Upload className="h-3.5 w-3.5" />
              Replace whole workspace
            </MenuItem>
            <p className="px-2 pb-1 pt-2 text-[10px] leading-relaxed text-muted-foreground">
              Tip: import <span className="font-medium text-foreground">plan</span> JSON to get Story
              Title library + ChatGPT batch flow.
            </p>
          </div>,
          document.body,
        )
      : null

  const toast =
    message
      ? createPortal(
          <p className="fixed bottom-4 right-4 z-[99999] max-w-sm rounded-xl border border-border bg-card px-4 py-3 text-xs text-foreground shadow-2xl">
            {message}
          </p>,
          document.body,
        )
      : null

  return (
    <div className={cn('relative', className)}>
      <Button
        ref={buttonRef}
        size="sm"
        variant="outline"
        className="rounded-xl"
        onClick={() => setOpen((value) => !value)}
      >
        <FileJson className="h-3.5 w-3.5" />
        {compact ? 'Import / Export' : 'Import / Export JSON'}
      </Button>
      {panel}
      {toast}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-foreground hover:bg-accent"
    >
      {children}
    </button>
  )
}
