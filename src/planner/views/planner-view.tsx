import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { usePlannerStore } from '@/planner/store/planner-store'
import { ActionPalette } from '@/planner/components/action-palette'
import { WorkflowCanvas } from '@/planner/components/workflow-canvas'
import { PropertyInspector } from '@/planner/components/property-inspector'
import { ActionDocsDrawer } from '@/planner/components/action-docs-drawer'
import { BuilderToolbar } from '@/planner/components/builder-toolbar'
import { ImportExportMenu } from '@/planner/components/import-export-menu'
import { TextLibrariesPanel } from '@/planner/components/text-libraries-panel'
import { CopyStorePanel } from '@/planner/components/copy-store-panel'
import { RunLogPanel } from '@/planner/components/run-log-panel'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { ACTION_LIBRARY } from '@/planner/actions/catalog'

export function PlannerView() {
  const hydrate = usePlannerStore((s) => s.hydrate)
  const plans = usePlannerStore((s) => s.plans)
  const workflows = usePlannerStore((s) => s.workflows)
  const selectedPlanId = usePlannerStore((s) => s.selectedPlanId)
  const selectedWorkflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const selectPlan = usePlannerStore((s) => s.selectPlan)
  const selectWorkflow = usePlannerStore((s) => s.selectWorkflow)
  const createPlan = usePlannerStore((s) => s.createPlan)
  const updatePlan = usePlannerStore((s) => s.updatePlan)
  const deletePlan = usePlannerStore((s) => s.deletePlan)
  const createWorkflow = usePlannerStore((s) => s.createWorkflow)
  const updateWorkflowMeta = usePlannerStore((s) => s.updateWorkflowMeta)
  const deleteWorkflow = usePlannerStore((s) => s.deleteWorkflow)
  const duplicateWorkflow = usePlannerStore((s) => s.duplicateWorkflow)
  const builderOpen = usePlannerStore((s) => s.builderOpen)
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)
  const setCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const theme = usePlannerStore((s) => s.theme)
  const setTheme = usePlannerStore((s) => s.setTheme)
  const [name, setName] = useState('New Workflow')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editingPlanName, setEditingPlanName] = useState('')
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [editingWorkflowName, setEditingWorkflowName] = useState('')

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const pull = () => {
      void sendRuntimeMessage<{ ok: boolean; checkpoint: typeof checkpoint }>({
        type: 'PLANNER_STATE',
      }).then((response) => {
        if (response.checkpoint !== undefined) setCheckpoint(response.checkpoint)
      })
    }

    pull()

    // Instant updates when the background runner writes the checkpoint
    const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return
      const key = 'ae:planner-checkpoint'
      if (!Object.prototype.hasOwnProperty.call(changes, key)) return
      setCheckpoint((changes[key]?.newValue as typeof checkpoint) ?? null)
    }
    chrome.storage.onChanged.addListener(onStorage)

    // Fast poll while running; slower when idle
    let timer = window.setInterval(pull, 400)
    const pace = window.setInterval(() => {
      const status = usePlannerStore.getState().checkpoint?.status
      const nextMs =
        status === 'running' || status === 'paused' || status === 'waiting' ? 350 : 2000
      window.clearInterval(timer)
      timer = window.setInterval(pull, nextMs)
    }, 1000)

    return () => {
      chrome.storage.onChanged.removeListener(onStorage)
      window.clearInterval(timer)
      window.clearInterval(pace)
    }
  }, [setCheckpoint])

  const planWorkflows = workflows.filter((wf) => wf.planId === selectedPlanId)

  if (builderOpen) {
    return (
      <div className="relative flex h-[100dvh] min-h-[680px] flex-col overflow-hidden bg-[hsl(var(--background))]">
        <BuilderToolbar />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ActionPalette />
          <div className="relative min-w-0 flex-1">
            <WorkflowCanvas />
            <RunLogPanel />
          </div>
          <PropertyInspector />
          <ActionDocsDrawer />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Workflow Planner
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Create a Workflow, then add Plans inside it. Visual drag-and-drop automation — configure
            actions, conditions, loops, and more from the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportMenu />
          <Button
            variant="outline"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? 'Dark' : 'Light'} mode
          </Button>
          <Button onClick={() => setBuilderOpen(true)} disabled={!selectedWorkflowId}>
            Open Builder
          </Button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-panel"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[220px] flex-1 space-y-1">
              <span className="text-xs font-medium">Create Workflow</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Facebook Automation"
              />
            </label>
            <Button
              onClick={() => {
                void createPlan(name.trim() || 'Untitled Workflow').then(() => {
                  setName('New Workflow')
                })
              }}
            >
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedPlanId === plan.id
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-border bg-secondary/40 text-foreground hover:bg-accent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    selectPlan(plan.id)
                    const first = workflows.find((wf) => wf.planId === plan.id)
                    selectWorkflow(first?.id ?? null)
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    {editingPlanId === plan.id ? (
                      <Input
                        value={editingPlanName}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditingPlanName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void updatePlan(plan.id, { name: editingPlanName }).then(() =>
                              setEditingPlanId(null),
                            )
                          }
                          if (event.key === 'Escape') setEditingPlanId(null)
                        }}
                        onBlur={() => {
                          void updatePlan(plan.id, { name: editingPlanName }).then(() =>
                            setEditingPlanId(null),
                          )
                        }}
                        className="h-8"
                      />
                    ) : (
                      <p className="font-medium text-foreground">Workflow: {plan.name}</p>
                    )}
                    <Badge variant="outline">
                      {plan.workflowIds.length}{' '}
                      {plan.workflowIds.length === 1 ? 'plan' : 'plans'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.description || 'No description'}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingPlanId(plan.id)
                      setEditingPlanName(plan.name)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation()
                      void deletePlan(plan.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workflows yet. Create your first workflow to get started.
              </p>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-lg font-semibold">Plans</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPlanId
                    ? `Inside workflow: ${plans.find((p) => p.id === selectedPlanId)?.name ?? '—'}`
                    : 'Select a workflow to manage its plans'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedPlanId}
                  onClick={() => {
                    if (!selectedPlanId) return
                    void createWorkflow(selectedPlanId).then(() => setBuilderOpen(true))
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedWorkflowId}
                  onClick={() => selectedWorkflowId && duplicateWorkflow(selectedWorkflowId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {planWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className={`rounded-xl border px-3 py-2 ${
                    selectedWorkflowId === wf.id
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectWorkflow(wf.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                      <Workflow className="h-4 w-4 shrink-0 text-primary" />
                      {editingWorkflowId === wf.id ? (
                        <Input
                          value={editingWorkflowName}
                          autoFocus
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setEditingWorkflowName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void updateWorkflowMeta(wf.id, { name: editingWorkflowName }).then(
                                () => setEditingWorkflowId(null),
                              )
                            }
                            if (event.key === 'Escape') setEditingWorkflowId(null)
                          }}
                          onBlur={() => {
                            void updateWorkflowMeta(wf.id, { name: editingWorkflowName }).then(() =>
                              setEditingWorkflowId(null),
                            )
                          }}
                          className="h-7"
                        />
                      ) : (
                        <span className="truncate">{wf.name}</span>
                      )}
                    </span>
                    <Badge variant="secondary">{wf.nodes.length} steps</Badge>
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        selectWorkflow(wf.id)
                        setEditingWorkflowId(wf.id)
                        setEditingWorkflowName(wf.name)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => void deleteWorkflow(wf.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {planWorkflows.length === 0 && selectedPlanId ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No plans yet. Create a plan inside this workflow.
              </p>
            ) : null}
            {!selectedPlanId ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Select a workflow on the left to see its plans.
              </p>
            ) : null}
            <Button className="mt-4 w-full" onClick={() => setBuilderOpen(true)} disabled={!selectedWorkflowId}>
              Edit in Visual Builder
            </Button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
            <p className="font-display text-lg font-semibold">Execution monitor</p>
            {checkpoint ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  Status:{' '}
                  <Badge
                    variant={
                      checkpoint.status === 'failed'
                        ? 'destructive'
                        : checkpoint.status === 'running'
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {checkpoint.status}
                  </Badge>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  Node: {checkpoint.currentNodeId ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  History entries: {checkpoint.history.length}
                </p>
                {(() => {
                  const lastFail = [...checkpoint.history]
                    .reverse()
                    .find((item) => item.error || item.status === 'failed' || item.status === 'timeout')
                  if (!lastFail) return null
                  return (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
                      <p className="font-semibold text-destructive">Last error</p>
                      <p className="mt-1 break-words">{lastFail.error ?? lastFail.status}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {lastFail.nodeId}
                      </p>
                    </div>
                  )
                })()}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void sendRuntimeMessage({ type: 'PLANNER_RESUME' })}
                >
                  Resume from checkpoint
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Full logs: open Visual Builder → bottom <strong>Run log</strong>, or sidebar →{' '}
                  <strong>Activity</strong>.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No active Workflow Planner run.</p>
            )}
          </div>

          <TextLibrariesPanel planId={selectedPlanId} />

          <CopyStorePanel workflowId={selectedWorkflowId} />

          <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
            <p className="font-display text-lg font-semibold">Action library</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ACTION_LIBRARY.length}+ prebuilt actions across browser, mouse, keyboard, AI sites,
              loops, conditions, downloads, and more.
            </p>
          </div>
        </motion.div>
      </section>
    </div>
  )
}
