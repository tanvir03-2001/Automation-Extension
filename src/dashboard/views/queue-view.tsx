import { motion } from 'framer-motion'
import { useDashboardStore } from '@/stores/dashboard-store'
import { Badge } from '@/components/ui/badge'

export function QueueView() {
  const queue = useDashboardStore((s) => s.queue)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Priority-aware job queue with durable storage and sequential execution.
        </p>
      </header>

      <div className="space-y-3">
        {queue.map((job, index) => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex items-center justify-between rounded-xl border border-border/80 bg-card px-4 py-3"
          >
            <div>
              <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
              <p className="mt-1 text-sm font-medium">Workflow · {job.workflowId}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">P{job.priority}</Badge>
              <Badge>{job.status}</Badge>
            </div>
          </motion.div>
        ))}
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Queue is empty.</p>
        ) : null}
      </div>
    </div>
  )
}
