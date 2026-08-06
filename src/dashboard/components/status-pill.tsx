import { Badge } from '@/components/ui/badge'
import type { WorkflowRunStatus, StepRunStatus } from '@/shared/types/workflow'

const runVariant: Record<
  WorkflowRunStatus,
  'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  idle: 'secondary',
  queued: 'outline',
  running: 'default',
  paused: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
}

const stepVariant: Record<
  StepRunStatus,
  'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
  skipped: 'outline',
  retrying: 'warning',
}

export function RunStatusPill({ status }: { status: WorkflowRunStatus }) {
  return <Badge variant={runVariant[status]}>{status}</Badge>
}

export function StepStatusPill({ status }: { status: StepRunStatus }) {
  return <Badge variant={stepVariant[status]}>{status}</Badge>
}
