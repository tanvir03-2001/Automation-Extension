import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Square, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/stores/dashboard-store'
import { ExecutionPreviewCanvas } from '@/planner/components/execution-preview-canvas'
import { usePlannerStore } from '@/planner/store/planner-store'
import { RunStatusPill } from '@/dashboard/components/status-pill'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'
import type { ExecutionCheckpoint, VisualWorkflow } from '@/planner/types/plan'

function mapCheckpointStatus(
  status: ExecutionCheckpoint['status'] | undefined,
): 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'idle' {
  if (!status) return 'idle'
  if (status === 'waiting') return 'paused'
  if (status === 'running' || status === 'paused') return status
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return status
  return 'idle'
}

function planProgress(checkpoint: ExecutionCheckpoint | null, plan: VisualWorkflow | undefined): number {
  if (!checkpoint || !plan || checkpoint.workflowId !== plan.id) {
    if (checkpoint?.status === 'completed' && plan && checkpoint.workflowId === plan.id) return 100
    return 0
  }
  const actionable = plan.nodes.filter(
    (node) => node.data.actionId !== 'flow.start' && node.data.actionId !== 'flow.end',
  )
  if (actionable.length === 0) {
    return checkpoint.status === 'completed' ? 100 : checkpoint.currentNodeId ? 50 : 0
  }
  const doneIds = new Set(
    checkpoint.history
      .filter((item) => item.status === 'success' || item.status === 'skipped')
      .map((item) => item.nodeId),
  )
  const finished = actionable.filter((node) => doneIds.has(node.id)).length
  if (checkpoint.status === 'completed') return 100
  return Math.min(99, Math.round((finished / actionable.length) * 100))
}

export function OverviewView() {
  const t = useT()
  const logs = useDashboardStore((s) => s.logs)
  const hydratePlanner = usePlannerStore((s) => s.hydrate)
  const persist = usePlannerStore((s) => s.persist)
  const plannerCheckpoint = usePlannerStore((s) => s.checkpoint)
  const setPlannerCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const plannerPlans = usePlannerStore((s) => s.workflows)
  const workflows = usePlannerStore((s) => s.plans)
  const selectedWorkflowId = usePlannerStore((s) => s.selectedPlanId)
  const selectedPlanId = usePlannerStore((s) => s.selectedWorkflowId)
  const selectWorkflow = usePlannerStore((s) => s.selectPlan)
  const selectPlan = usePlannerStore((s) => s.selectWorkflow)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    void hydratePlanner()
  }, [hydratePlanner])

  useEffect(() => {
    const pull = () => {
      void sendRuntimeMessage<{ ok: boolean; checkpoint: typeof plannerCheckpoint }>({
        type: 'PLANNER_STATE',
      }).then((response) => {
        if (response.checkpoint !== undefined) setPlannerCheckpoint(response.checkpoint)
      })
    }
    pull()
    const status = plannerCheckpoint?.status
    const ms =
      status === 'running' || status === 'paused' || status === 'waiting' ? 350 : 1000
    const timer = window.setInterval(pull, ms)
    return () => window.clearInterval(timer)
  }, [setPlannerCheckpoint, plannerCheckpoint?.status])

  // Keep store selection on the live Plan so shared run visuals stay in sync.
  useEffect(() => {
    if (!plannerCheckpoint?.workflowId) return
    if (
      plannerCheckpoint.status !== 'running' &&
      plannerCheckpoint.status !== 'paused' &&
      plannerCheckpoint.status !== 'waiting'
    ) {
      return
    }
    const running = plannerPlans.find((plan) => plan.id === plannerCheckpoint.workflowId)
    if (!running) return
    if (selectedWorkflowId !== running.planId) selectWorkflow(running.planId)
    if (selectedPlanId !== running.id) selectPlan(running.id)
  }, [
    plannerCheckpoint?.workflowId,
    plannerCheckpoint?.status,
    plannerPlans,
    selectedWorkflowId,
    selectedPlanId,
    selectWorkflow,
    selectPlan,
  ])

  // Default-select first workflow + its first plan
  useEffect(() => {
    if (workflows.length === 0) return
    if (!selectedWorkflowId || !workflows.some((wf) => wf.id === selectedWorkflowId)) {
      const first = workflows[0]
      selectWorkflow(first.id)
      const firstPlan = plannerPlans.find((plan) => plan.planId === first.id)
      selectPlan(firstPlan?.id ?? null)
      return
    }
    const plansInSelected = plannerPlans.filter((plan) => plan.planId === selectedWorkflowId)
    if (
      plansInSelected.length > 0 &&
      (!selectedPlanId || !plansInSelected.some((plan) => plan.id === selectedPlanId))
    ) {
      selectPlan(plansInSelected[0].id)
    }
  }, [
    workflows,
    plannerPlans,
    selectedWorkflowId,
    selectedPlanId,
    selectWorkflow,
    selectPlan,
  ])

  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId) ?? null
  const plansInWorkflow = useMemo(
    () => plannerPlans.filter((plan) => plan.planId === selectedWorkflow?.id),
    [plannerPlans, selectedWorkflow?.id],
  )
  const selectedPlan =
    plansInWorkflow.find((plan) => plan.id === selectedPlanId) ?? plansInWorkflow[0] ?? null

  const plannerBusy =
    plannerCheckpoint != null &&
    (plannerCheckpoint.status === 'running' ||
      plannerCheckpoint.status === 'paused' ||
      plannerCheckpoint.status === 'waiting')

  const activePlan = plannerBusy
    ? plannerPlans.find((plan) => plan.id === plannerCheckpoint.workflowId)
    : undefined
  const activeWorkflow = plannerBusy
    ? workflows.find((wf) => wf.id === plannerCheckpoint.planId)
    : undefined

  const displayWorkflow = activeWorkflow ?? selectedWorkflow
  const displayPlan = activePlan ?? selectedPlan
  const progress = planProgress(plannerCheckpoint, displayPlan ?? undefined)
  const runStatus = mapCheckpointStatus(plannerCheckpoint?.status)
  const selectedIsRunning =
    plannerBusy &&
    (plannerCheckpoint.planId === selectedWorkflow?.id ||
      plannerCheckpoint.workflowId === selectedPlan?.id)

  const previewWorkflowId = plannerBusy
    ? plannerCheckpoint.workflowId
    : (selectedPlan?.id ?? null)
  // Only while a run is active — on stop/complete/cancel, sections restore to default sizes.
  const liveExpanded = plannerBusy

  async function startSelected() {
    if (!selectedPlan || plannerBusy) return
    setStarting(true)
    try {
      await persist()
      const fresh =
        usePlannerStore.getState().workflows.find((plan) => plan.id === selectedPlan.id) ??
        selectedPlan
      const response = await sendRuntimeMessage<{
        ok: boolean
        checkpoint?: typeof plannerCheckpoint
        error?: string
      }>({
        type: 'PLANNER_START',
        payload: { workflow: fresh },
      })
      if (response.checkpoint) setPlannerCheckpoint(response.checkpoint)
    } finally {
      setStarting(false)
    }
  }

  async function pauseRun() {
    const response = await sendRuntimeMessage<{ ok: boolean; checkpoint?: typeof plannerCheckpoint }>(
      { type: 'PLANNER_PAUSE' },
    )
    if (response.checkpoint) setPlannerCheckpoint(response.checkpoint)
  }

  async function resumeRun() {
    const response = await sendRuntimeMessage<{ ok: boolean; checkpoint?: typeof plannerCheckpoint }>(
      { type: 'PLANNER_RESUME' },
    )
    if (response.checkpoint) setPlannerCheckpoint(response.checkpoint)
  }

  async function cancelRun() {
    const response = await sendRuntimeMessage<{ ok: boolean; checkpoint?: typeof plannerCheckpoint }>(
      { type: 'PLANNER_CANCEL' },
    )
    if (response.checkpoint !== undefined) setPlannerCheckpoint(response.checkpoint)
    else setPlannerCheckpoint(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 space-y-1"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          {t('overview.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('overview.subtitle')}</p>
      </motion.header>

      <motion.div
        layout
        className={cn(
          'grid min-h-0 flex-1 gap-4 transition-[grid-template-columns] duration-700 ease-out',
          'lg:h-full lg:grid-rows-[minmax(0,1fr)] lg:items-stretch',
          liveExpanded
            ? 'lg:grid-cols-[minmax(180px,0.65fr)_minmax(168px,0.55fr)_minmax(0,2.7fr)]'
            : 'lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.35fr)_minmax(260px,1fr)]',
        )}
      >
        <motion.section
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="flex h-full min-h-[220px] flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-panel backdrop-blur md:p-5 lg:min-h-0"
        >
          <p className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t('overview.workflows')}
          </p>
          <h2 className="mt-1 shrink-0 font-display text-lg font-semibold md:text-xl">
            {t('overview.yourWorkflows')}
          </h2>
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {workflows.map((workflow) => {
              const planCount = plannerPlans.filter((plan) => plan.planId === workflow.id).length
              const active = selectedWorkflowId === workflow.id
              const runningHere =
                plannerBusy && plannerCheckpoint?.planId === workflow.id
              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => {
                    selectWorkflow(workflow.id)
                    const first = plannerPlans.find((plan) => plan.planId === workflow.id)
                    selectPlan(first?.id ?? null)
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition',
                    active
                      ? 'border-primary/50 bg-primary/15'
                      : 'border-border/70 bg-background/60 hover:bg-accent/70',
                  )}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Workflow className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{workflow.name}</p>
                      {runningHere ? (
                        <Badge variant="default" className="shrink-0 capitalize">
                          {plannerCheckpoint?.status}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {planCount} {planCount === 1 ? t('common.plan') : t('common.plans')}
                    </p>
                  </div>
                </button>
              )
            })}
            {workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('overview.noWorkflows')}</p>
            ) : null}
          </div>
        </motion.section>

        <motion.section
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, layout: { duration: 0.7, ease: 'easeOut' } }}
          className={cn(
            'flex h-full min-h-[220px] flex-col rounded-2xl border border-border/80 bg-card shadow-panel backdrop-blur lg:min-h-0',
            liveExpanded ? 'p-3' : 'p-4 md:p-5',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t('overview.activeRun')}
              </p>
              <h2
                className={cn(
                  'mt-0.5 truncate font-display font-semibold leading-snug',
                  liveExpanded ? 'text-sm' : 'text-lg md:text-xl',
                )}
                title={displayWorkflow?.name}
              >
                {displayWorkflow?.name ?? t('overview.noWorkflowSelected')}
              </h2>
              {displayPlan ? (
                <p
                  className={cn(
                    'mt-0.5 truncate text-muted-foreground',
                    liveExpanded ? 'text-xs' : 'text-xs',
                  )}
                  title={displayPlan.name}
                >
                  {liveExpanded
                    ? displayPlan.name
                    : t('overview.currentPlan', { name: displayPlan.name })}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t('overview.selectWorkflowWithPlan')}
                </p>
              )}
            </div>
            {plannerCheckpoint && runStatus !== 'idle' ? (
              <RunStatusPill status={runStatus} />
            ) : null}
          </div>

          <div className={cn('shrink-0 space-y-1.5', liveExpanded ? 'mt-2.5' : 'mt-4')}>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('common.progress')}</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} className={liveExpanded ? 'h-1.5' : undefined} />
          </div>

          <div
            className={cn(
              'shrink-0',
              liveExpanded ? 'mt-2.5 grid grid-cols-2 gap-1.5' : 'mt-4 flex flex-wrap gap-2',
            )}
          >
            <Button
              size="sm"
              className={cn(liveExpanded && 'h-8 px-2 text-xs')}
              onClick={() => void startSelected()}
              disabled={!selectedPlan || plannerBusy || starting}
              title={t('common.start')}
            >
              <Play className="h-3.5 w-3.5" />
              {t('common.start')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(liveExpanded && 'h-8 px-2 text-xs')}
              onClick={() => void pauseRun()}
              disabled={plannerCheckpoint?.status !== 'running'}
              title={t('common.pause')}
            >
              <Pause className="h-3.5 w-3.5" />
              {t('common.pause')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(liveExpanded && 'h-8 px-2 text-xs')}
              onClick={() => void resumeRun()}
              disabled={
                plannerCheckpoint?.status !== 'paused' &&
                plannerCheckpoint?.status !== 'waiting'
              }
              title={t('common.resume')}
            >
              {t('common.resume')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className={cn(liveExpanded && 'h-8 px-2 text-xs')}
              onClick={() => void cancelRun()}
              disabled={!plannerBusy}
              title={t('common.cancel')}
            >
              <Square className="h-3.5 w-3.5" />
              {t('common.cancel')}
            </Button>
          </div>

          {plannerCheckpoint?.status === 'failed' ? (
            <p className="mt-2 shrink-0 rounded-lg bg-destructive/10 px-2 py-1.5 text-sm text-destructive">
              {[...plannerCheckpoint.history].reverse().find((item) => item.error)?.error ??
                t('overview.runFailed')}
            </p>
          ) : null}

          {!selectedIsRunning && plannerBusy ? (
            <p className="mt-2 shrink-0 rounded-lg border border-border/70 bg-muted/40 px-2 py-1.5 text-sm text-muted-foreground">
              {t('overview.anotherRun')}
            </p>
          ) : null}

          <Separator className={cn('shrink-0', liveExpanded ? 'my-2.5' : 'my-4')} />

          <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
            <p className={cn('shrink-0 font-medium', liveExpanded ? 'text-xs' : 'text-sm')}>
              {t('overview.plans')}
            </p>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-0.5">
              {plansInWorkflow.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id
                const isCurrent =
                  plannerBusy && plannerCheckpoint?.workflowId === plan.id
                const nodeCount = plan.nodes.filter(
                  (node) =>
                    node.data.actionId !== 'flow.start' && node.data.actionId !== 'flow.end',
                ).length
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => selectPlan(plan.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg border text-left transition',
                      liveExpanded ? 'px-2 py-1.5' : 'px-3 py-2',
                      isSelected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border/70 bg-background/60 hover:bg-accent/60',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium md:text-sm">{plan.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {nodeCount} {t('common.steps')}
                      </p>
                    </div>
                    {isCurrent ? (
                      <Badge variant="default" className="shrink-0 capitalize">
                        {plannerCheckpoint?.status}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        {isSelected ? t('common.on') : t('common.ready')}
                      </Badge>
                    )}
                  </button>
                )
              })}
              {plansInWorkflow.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('overview.noPlans')}</p>
              ) : null}
            </div>
          </div>
        </motion.section>

        <motion.section
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, layout: { duration: 0.7, ease: 'easeOut' } }}
          className="flex h-full min-h-[280px] flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-panel backdrop-blur md:p-5 lg:min-h-0"
        >
          <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t('overview.liveActivity')}
              </p>
              <h2 className="mt-0.5 font-display text-lg font-semibold md:text-xl">
                {liveExpanded ? t('overview.liveExecution') : t('overview.planPreview')}
              </h2>
            </div>
            {displayPlan ? (
              <Badge variant="outline" className="max-w-[200px] truncate">
                {displayPlan.name}
              </Badge>
            ) : null}
          </div>

          <div className="min-h-0 flex-1">
            <ExecutionPreviewCanvas workflowId={previewWorkflowId} />
          </div>

          {!liveExpanded ? (
            <div className="mt-2 max-h-24 shrink-0 space-y-1.5 overflow-auto border-t border-border/60 pt-2">
              {logs.slice(0, 4).map((log) => (
                <div key={log.id} className="truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{log.source}</span>
                  {' · '}
                  {log.message}
                </div>
              ))}
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('overview.startToExpand')}</p>
              ) : null}
            </div>
          ) : null}
        </motion.section>
      </motion.div>
    </div>
  )
}
