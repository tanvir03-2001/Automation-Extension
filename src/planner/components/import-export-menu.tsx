import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileJson, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlannerStore } from '@/planner/store/planner-store'
import {
  downloadJson,
  pickJsonFile,
  readJsonFile,
  safeDownloadName,
} from '@/planner/io/export-import'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'

type ExportScope =
  | 'workspace'
  | 'allWorkflows'
  | 'currentWorkflow'
  | 'currentPlan'
  | 'snippet'

export function ImportExportMenu({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const plans = usePlannerStore((s) => s.plans)
  const workflows = usePlannerStore((s) => s.workflows)
  const selectedPlanId = usePlannerStore((s) => s.selectedPlanId)
  const selectedWorkflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const selectedNodeId = usePlannerStore((s) => s.selectedNodeId)
  const exportWorkspacePayload = usePlannerStore((s) => s.exportWorkspacePayload)
  const exportPlanPayload = usePlannerStore((s) => s.exportPlanPayload)
  const exportWorkflowPayload = usePlannerStore((s) => s.exportWorkflowPayload)
  const exportSnippetPayload = usePlannerStore((s) => s.exportSnippetPayload)
  const importPayload = usePlannerStore((s) => s.importPayload)

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null
  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId) ?? null
  const selectedNode = selectedWorkflow?.nodes.find((node) => node.id === selectedNodeId) ?? null

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

  async function onExport(scope: ExportScope) {
    try {
      if (scope === 'workspace') {
        downloadJson(safeDownloadName('full-workspace'), exportWorkspacePayload())
      } else if (scope === 'allWorkflows') {
        // All AutomationPlans (+ their Plans) — same portable workspace bundle
        downloadJson(safeDownloadName('all-workflows'), exportWorkspacePayload())
      } else if (scope === 'currentWorkflow') {
        if (!selectedPlanId || !selectedPlan) throw new Error('Select a workflow first')
        downloadJson(
          safeDownloadName(selectedPlan.name, 'workflow'),
          exportPlanPayload(selectedPlanId),
        )
      } else if (scope === 'currentPlan') {
        if (!selectedWorkflowId || !selectedWorkflow) throw new Error('Select a plan first')
        downloadJson(
          safeDownloadName(selectedWorkflow.name, 'plan'),
          exportWorkflowPayload(selectedWorkflowId),
        )
      } else {
        if (!selectedWorkflowId || !selectedWorkflow) throw new Error('Select a plan first')
        const nodeIds = selectedNodeId ? [selectedNodeId] : undefined
        const stepName = selectedNode?.data.label
        const fileBase = stepName
          ? `${selectedWorkflow.name}-${stepName}`
          : `${selectedWorkflow.name}-snippet`
        downloadJson(
          safeDownloadName(fileBase, 'snippet'),
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
            className="fixed z-[99999] w-80 rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('importExport.export')}
            </p>
            <MenuItem onClick={() => void onExport('workspace')}>
              <Download className="h-3.5 w-3.5" />
              <span className="min-w-0">
                <span className="block">{t('importExport.workspace')}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  full-workspace.json
                </span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => void onExport('allWorkflows')}>
              <Download className="h-3.5 w-3.5" />
              <span className="min-w-0">
                <span className="block">{t('importExport.allWorkflows')}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  all-workflows.json
                </span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => void onExport('currentWorkflow')}>
              <Download className="h-3.5 w-3.5" />
              <span className="min-w-0">
                <span className="block">{t('importExport.currentWorkflow')}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {selectedPlan
                    ? safeDownloadName(selectedPlan.name, 'workflow')
                    : t('importExport.needWorkflow')}
                </span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => void onExport('currentPlan')}>
              <Download className="h-3.5 w-3.5" />
              <span className="min-w-0">
                <span className="block">{t('importExport.currentPlan')}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {selectedWorkflow
                    ? safeDownloadName(selectedWorkflow.name, 'plan')
                    : t('importExport.needPlan')}
                </span>
              </span>
            </MenuItem>
            <MenuItem onClick={() => void onExport('snippet')}>
              <Download className="h-3.5 w-3.5" />
              <span className="min-w-0">
                <span className="block">
                  {selectedNodeId ? t('importExport.selectedStep') : t('importExport.snippet')}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {selectedWorkflow
                    ? safeDownloadName(
                        selectedNode
                          ? `${selectedWorkflow.name}-${selectedNode.data.label}`
                          : `${selectedWorkflow.name}-snippet`,
                        'snippet',
                      )
                    : t('importExport.needPlan')}
                </span>
              </span>
            </MenuItem>

            <div className="my-2 h-px bg-[hsl(var(--border))]" />
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('importExport.import')}
            </p>
            <MenuItem onClick={() => void onImport('merge')}>
              <Upload className="h-3.5 w-3.5" />
              {t('importExport.merge')}
            </MenuItem>
            <MenuItem onClick={() => void onImport('replace')}>
              <Upload className="h-3.5 w-3.5" />
              {t('importExport.replace')}
            </MenuItem>
            <p className="px-2 pb-1 pt-2 text-[10px] leading-relaxed text-muted-foreground">
              {t('importExport.tip')}
            </p>
          </div>,
          document.body,
        )
      : null

  const toast = message
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
        {compact ? t('importExport.compact') : t('importExport.title')}
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
