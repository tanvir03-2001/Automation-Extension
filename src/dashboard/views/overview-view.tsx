import { motion } from 'framer-motion'
import { Pause, Play, Square } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useDashboardStore } from '@/stores/dashboard-store'
import { RunStatusPill, StepStatusPill } from '@/dashboard/components/status-pill'
import {
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  startWorkflow,
} from '@/dashboard/api/extension-api'

export function OverviewView() {
  const run = useDashboardStore((s) => s.run)
  const workflows = useDashboardStore((s) => s.workflows)
  const selectedWorkflowId = useDashboardStore((s) => s.selectedWorkflowId)
  const logs = useDashboardStore((s) => s.logs)
  const queryClient = useQueryClient()

  const selected = workflows.find((w) => w.id === selectedWorkflowId) ?? workflows[0]

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No workflow selected')
      return startWorkflow(selected)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['run'] })
      void queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })

  const busy = run?.status === 'running' || run?.status === 'paused'

  return (
    <div className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Run configurable browser workflows. The extension only automates pages — it never
          generates content or makes AI decisions.
        </p>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border/80 bg-card p-5 shadow-panel backdrop-blur"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Active run
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">
                {run?.workflowName ?? selected?.name ?? 'No workflow'}
              </h2>
            </div>
            {run ? <RunStatusPill status={run.status} /> : null}
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="font-mono">{run?.progress ?? 0}%</span>
            </div>
            <Progress value={run?.progress ?? 0} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => startMutation.mutate()}
              disabled={!selected || busy || startMutation.isPending}
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
            <Button
              variant="outline"
              onClick={() => void pauseWorkflow().then(() => queryClient.invalidateQueries({ queryKey: ['run'] }))}
              disabled={run?.status !== 'running'}
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button
              variant="outline"
              onClick={() => void resumeWorkflow().then(() => queryClient.invalidateQueries({ queryKey: ['run'] }))}
              disabled={run?.status !== 'paused'}
            >
              Resume
            </Button>
            <Button
              variant="destructive"
              onClick={() => void cancelWorkflow().then(() => queryClient.invalidateQueries({ queryKey: ['run'] }))}
              disabled={!busy}
            >
              <Square className="h-4 w-4" />
              Cancel
            </Button>
          </div>

          {run?.error ? (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {run.error}
            </p>
          ) : null}

          <Separator className="my-5" />

          <div className="space-y-2">
            <p className="text-sm font-medium">Steps</p>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {(run?.steps ?? selected?.steps.map((step) => ({
                stepId: step.id,
                name: step.name,
                type: step.type,
                status: 'pending' as const,
                attempt: 0,
              })) ?? []).map((step) => (
                <div
                  key={step.stepId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{step.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{step.type}</p>
                  </div>
                  <StepStatusPill status={step.status} />
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-border/80 bg-card p-5 shadow-panel backdrop-blur"
        >
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Live activity</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Recent events</h2>
          <div className="mt-4 max-h-[28rem] space-y-3 overflow-auto">
            {logs.slice(0, 12).map((log) => (
              <div key={log.id} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{log.source}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{log.message}</p>
              </div>
            ))}
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet. Start a workflow.</p>
            ) : null}
          </div>
        </motion.section>
      </div>
    </div>
  )
}
