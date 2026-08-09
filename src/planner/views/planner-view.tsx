import { useEffect, useState } from 'react'
import {
  Download,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-react'
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
import { DatasetManagerPanel } from '@/planner/components/dataset-manager-panel'
import { PlannerHubLayout } from '@/planner/components/planner-hub-layout'
import { RunLogPanel } from '@/planner/components/run-log-panel'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import {
  downloadJson,
  pickJsonFile,
  readJsonFile,
  safeDownloadName,
} from '@/planner/io/export-import'
import { useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'
import { ScrollArea } from '@/components/ui/scroll-area'

export function PlannerView() {
  const t = useT()
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
  const builderOpen = usePlannerStore((s) => s.builderOpen)
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)
  const setCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const exportWorkflowPayload = usePlannerStore((s) => s.exportWorkflowPayload)
  const importPayload = usePlannerStore((s) => s.importPayload)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editingPlanName, setEditingPlanName] = useState('')
  const [editingPlanDescription, setEditingPlanDescription] = useState('')
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [editingWorkflowName, setEditingWorkflowName] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!checkpoint?.workflowId) return
    if (
      checkpoint.status !== 'running' &&
      checkpoint.status !== 'paused' &&
      checkpoint.status !== 'waiting'
    ) {
      return
    }
    if (checkpoint.workflowId === selectedWorkflowId) return
    const running = workflows.find((wf) => wf.id === checkpoint.workflowId)
    if (!running) return
    selectPlan(running.planId)
    selectWorkflow(running.id)
  }, [
    checkpoint?.workflowId,
    checkpoint?.status,
    selectedWorkflowId,
    workflows,
    selectPlan,
    selectWorkflow,
  ])

  useEffect(() => {
    const pull = () => {
      void sendRuntimeMessage<{ ok: boolean; checkpoint: typeof checkpoint }>({
        type: 'PLANNER_STATE',
      }).then((response) => {
        if (response.checkpoint !== undefined) setCheckpoint(response.checkpoint)
      })
    }

    pull()

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

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const planWorkflows = workflows.filter((wf) => wf.planId === selectedPlanId)
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null

  async function exportPlan(workflowId: string, planName: string) {
    try {
      downloadJson(safeDownloadName(planName, 'plan'), exportWorkflowPayload(workflowId))
      setToast(t('planner.exportOk'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    }
  }

  async function importPlanIntoWorkflow() {
    if (!selectedPlanId) {
      setToast(t('planner.selectLeft'))
      return
    }
    try {
      const file = await pickJsonFile()
      if (!file) return
      const raw = await readJsonFile(file)
      const result = await importPayload(raw, 'merge')
      setToast(result)
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    }
  }

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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {t('planner.title')}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{t('planner.subtitleShort')}</p>
        </div>
        <ImportExportMenu compact />
      </header>

      <PlannerHubLayout
        workflows={
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-panel">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-3">
            <div>
              <p className="text-base font-semibold text-foreground">{t('planner.workflows')}</p>
              <p className="text-sm text-muted-foreground">{t('planner.workflowsHint')}</p>
            </div>
            <Button
              size="sm"
              className="h-9 shrink-0 rounded-lg px-3 text-sm"
              onClick={() => setShowCreateWorkflow((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              {t('planner.createWorkflow')}
            </Button>
          </div>

          {showCreateWorkflow ? (
            <div className="shrink-0 space-y-2 border-b border-border bg-muted/25 px-3 py-3">
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">{t('planner.name')}</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('planner.namePlaceholder')}
                  className="h-9"
                  autoFocus
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">{t('planner.description')}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('planner.descPlaceholder')}
                  rows={2}
                  className="min-h-[56px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[15px] text-foreground outline-none ring-ring focus:ring-2"
                />
              </label>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-9 rounded-lg px-3 text-sm"
                  disabled={!name.trim()}
                  onClick={() => {
                    const trimmedName = name.trim()
                    if (!trimmedName) return
                    void createPlan(trimmedName, description).then(() => {
                      setName('')
                      setDescription('')
                      setShowCreateWorkflow(false)
                    })
                  }}
                >
                  {t('common.save')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 rounded-lg px-3 text-sm"
                  onClick={() => {
                    setShowCreateWorkflow(false)
                    setName('')
                    setDescription('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : null}

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {plans.map((plan) => {
                const active = selectedPlanId === plan.id
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 transition',
                      active
                        ? 'border-primary/45 bg-primary/10'
                        : 'border-border/70 bg-background/50 hover:bg-accent/50',
                    )}
                  >
                    {editingPlanId === plan.id ? (
                      <div className="space-y-1.5">
                        <Input
                          value={editingPlanName}
                          autoFocus
                          onChange={(event) => setEditingPlanName(event.target.value)}
                          className="h-9 text-[15px]"
                          placeholder={t('planner.name')}
                        />
                        <textarea
                          value={editingPlanDescription}
                          onChange={(event) => setEditingPlanDescription(event.target.value)}
                          rows={2}
                          placeholder={t('planner.description')}
                          className="min-h-[52px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-8 px-2.5 text-sm"
                            onClick={() => {
                              void updatePlan(plan.id, {
                                name: editingPlanName,
                                description: editingPlanDescription,
                              }).then(() => setEditingPlanId(null))
                            }}
                          >
                            {t('common.save')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2.5 text-sm"
                            onClick={() => setEditingPlanId(null)}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          selectPlan(plan.id)
                          const first = workflows.find((wf) => wf.planId === plan.id)
                          selectWorkflow(first?.id ?? null)
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[15px] font-medium text-foreground">{plan.name}</p>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {plan.workflowIds.length}{' '}
                            {plan.workflowIds.length === 1 ? t('common.plan') : t('common.plans')}
                          </Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {plan.description || t('common.noDescription')}
                        </p>
                      </button>
                    )}
                    {editingPlanId !== plan.id ? (
                      <div className="mt-1.5 flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-sm"
                          onClick={() => {
                            setEditingPlanId(plan.id)
                            setEditingPlanName(plan.name)
                            setEditingPlanDescription(plan.description ?? '')
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-sm text-destructive hover:text-destructive"
                          onClick={() => void deletePlan(plan.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {plans.length === 0 ? (
                <p className="px-1 py-6 text-center text-[15px] text-muted-foreground">
                  {t('planner.noWorkflowsYet')}
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </section>
        }
        plans={
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-panel">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">{t('planner.plans')}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedPlan
                    ? t('planner.insideWorkflow', { name: selectedPlan.name })
                    : t('planner.selectWorkflowPlans')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg px-2.5 text-sm"
                  disabled={!selectedPlanId}
                  onClick={() => void importPlanIntoWorkflow()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('common.import')}
                </Button>
                <Button
                  size="sm"
                  className="h-9 rounded-lg px-2.5 text-sm"
                  disabled={!selectedPlanId}
                  onClick={() => {
                    if (!selectedPlanId) return
                    void createWorkflow(selectedPlanId)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('planner.createPlan')}
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-3">
                {!selectedPlanId ? (
                  <p className="px-1 py-8 text-center text-[15px] text-muted-foreground">
                    {t('planner.selectLeft')}
                  </p>
                ) : planWorkflows.length === 0 ? (
                  <p className="px-1 py-8 text-center text-[15px] text-muted-foreground">
                    {t('planner.noPlanAvailable')}
                  </p>
                ) : (
                  planWorkflows.map((wf) => {
                    const active = selectedWorkflowId === wf.id
                    return (
                      <div
                        key={wf.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 transition',
                          active
                            ? 'border-primary/45 bg-primary/10'
                            : 'border-border/70 bg-background/50 hover:bg-accent/50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectWorkflow(wf.id)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
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
                                    void updateWorkflowMeta(wf.id, {
                                      name: editingWorkflowName,
                                    }).then(() => setEditingWorkflowId(null))
                                  }
                                  if (event.key === 'Escape') setEditingWorkflowId(null)
                                }}
                                onBlur={() => {
                                  void updateWorkflowMeta(wf.id, {
                                    name: editingWorkflowName,
                                  }).then(() => setEditingWorkflowId(null))
                                }}
                                className="h-9"
                              />
                            ) : (
                              <span className="truncate">{wf.name}</span>
                            )}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {wf.nodes.length} {t('common.steps')}
                          </Badge>
                        </button>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            className="h-9 rounded-md px-2.5 text-sm"
                            onClick={() => {
                              selectWorkflow(wf.id)
                              setBuilderOpen(true)
                            }}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            {t('planner.configurePlan')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-sm"
                            onClick={() => {
                              setEditingWorkflowId(wf.id)
                              setEditingWorkflowName(wf.name)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {t('common.edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-sm"
                            onClick={() => void exportPlan(wf.id, wf.name)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t('common.export')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-sm text-destructive hover:text-destructive"
                            onClick={() => void deleteWorkflow(wf.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('common.delete')}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        }
        datasets={
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <DatasetManagerPanel planId={selectedPlanId} compact />
          </div>
        }
      />

      {toast ? (
        <p className="fixed bottom-4 right-4 z-[99999] max-w-sm rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-2xl">
          {toast}
        </p>
      ) : null}
    </div>
  )
}
