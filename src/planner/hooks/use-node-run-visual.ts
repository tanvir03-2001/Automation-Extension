import { useRunVisualWorkflowIdOverride } from '@/planner/hooks/run-visual-workflow-context'
import { usePlannerStore } from '@/planner/store/planner-store'
import type { ExecutionCheckpoint } from '@/planner/types/plan'

export type NodeRunVisual =
  | 'idle'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'success'
  | 'failed'
  | 'skipped'

export function deriveNodeRunVisual(
  nodeId: string,
  checkpoint: ExecutionCheckpoint | null,
  workflowId: string | null,
): NodeRunVisual {
  if (!checkpoint || !workflowId || checkpoint.workflowId !== workflowId) return 'idle'

  const isLive =
    checkpoint.status === 'running' ||
    checkpoint.status === 'paused' ||
    checkpoint.status === 'waiting'

  if (isLive && checkpoint.currentNodeId === nodeId) {
    if (checkpoint.status === 'paused') return 'paused'
    if (checkpoint.status === 'waiting') return 'waiting'
    return 'running'
  }

  for (let i = checkpoint.history.length - 1; i >= 0; i -= 1) {
    const entry = checkpoint.history[i]
    if (entry.nodeId !== nodeId) continue
    if (entry.status === 'failed' || entry.status === 'timeout') return 'failed'
    if (entry.status === 'success') return 'success'
    if (entry.status === 'skipped') return 'skipped'
    if (entry.status === 'waiting') return 'waiting'
    if (entry.status === 'retrying' || entry.status === 'running') {
      return isLive && checkpoint.currentNodeId === nodeId ? 'running' : 'success'
    }
  }

  return 'idle'
}

/** Latest history status per node (for edge “done” path). */
export function latestHistoryStatusMap(
  checkpoint: ExecutionCheckpoint | null,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!checkpoint) return map
  for (const entry of checkpoint.history) {
    map.set(entry.nodeId, entry.status)
  }
  return map
}

export function useNodeRunVisual(nodeId: string): NodeRunVisual {
  const overrideId = useRunVisualWorkflowIdOverride()
  const selectedWorkflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const workflowId = overrideId ?? selectedWorkflowId
  return usePlannerStore((s) => deriveNodeRunVisual(nodeId, s.checkpoint, workflowId))
}

export function useActiveRunLabel(): {
  active: boolean
  status: ExecutionCheckpoint['status'] | null
  label: string | null
  nodeId: string | null
} {
  const overrideId = useRunVisualWorkflowIdOverride()
  const selectedWorkflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const workflowId = overrideId ?? selectedWorkflowId
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))

  if (!checkpoint || !workflowId || checkpoint.workflowId !== workflowId) {
    return { active: false, status: null, label: null, nodeId: null }
  }

  const live =
    checkpoint.status === 'running' ||
    checkpoint.status === 'paused' ||
    checkpoint.status === 'waiting'

  const nodeId = checkpoint.currentNodeId
  const label = nodeId
    ? (workflow?.nodes.find((n) => n.id === nodeId)?.data.label ?? nodeId)
    : null

  return {
    active: live || checkpoint.status === 'failed' || checkpoint.status === 'completed',
    status: checkpoint.status,
    label,
    nodeId,
  }
}
