import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { ActionFlowNode } from '@/planner/components/action-node'
import { latestHistoryStatusMap } from '@/planner/hooks/use-node-run-visual'
import type { ExecutionCheckpoint, PlannerEdge, PlannerNode } from '@/planner/types/plan'

export const plannerNodeTypes = {
  action: ActionFlowNode,
  start: ActionFlowNode,
  end: ActionFlowNode,
}

export const defaultPlannerEdgeOptions: Partial<Edge> = {
  type: 'smoothstep',
  animated: true,
  selectable: true,
  focusable: true,
  reconnectable: true,
  interactionWidth: 28,
  style: { stroke: '#94a3b8', strokeWidth: 2.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: '#94a3b8',
  },
}

export function toFlowNodes(nodes: PlannerNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }))
}

export function toFlowEdges(edges: PlannerEdge[]): Edge[] {
  const seen = new Set<string>()
  const unique: PlannerEdge[] = []
  for (const edge of edges) {
    const key = `${edge.source}|${edge.sourceHandle ?? 'out'}|${edge.target}|${edge.targetHandle ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(edge)
  }

  return unique.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? 'out',
    targetHandle: edge.targetHandle ?? undefined,
    ...defaultPlannerEdgeOptions,
    label: edge.label,
    selected: false,
  }))
}

export function applyRunEdgeStyles(
  edges: Edge[],
  args: {
    workflowId: string | null
    checkpoint: ExecutionCheckpoint | null
    selectedEdgeId?: string | null
  },
): Edge[] {
  const { workflowId, checkpoint, selectedEdgeId = null } = args
  const live =
    Boolean(checkpoint) &&
    Boolean(workflowId) &&
    checkpoint!.workflowId === workflowId &&
    (checkpoint!.status === 'running' ||
      checkpoint!.status === 'paused' ||
      checkpoint!.status === 'waiting' ||
      checkpoint!.status === 'failed' ||
      checkpoint!.status === 'completed')

  const historyMap = latestHistoryStatusMap(live ? checkpoint : null)
  const currentId = live ? checkpoint?.currentNodeId : null
  const previousId = live ? checkpoint?.previousNodeId : null

  return edges.map((edge) => {
    const selected = selectedEdgeId ? edge.id === selectedEdgeId : Boolean(edge.selected)
    if (selected) {
      return {
        ...edge,
        selected: true,
        animated: false,
        className: 'ae-edge-selected',
        style: { stroke: '#0f766e', strokeWidth: 3.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#0f766e',
        },
      }
    }

    const intoCurrent = Boolean(currentId && edge.target === currentId)
    const fromPrevious = Boolean(
      previousId && currentId && edge.source === previousId && edge.target === currentId,
    )
    const sourceDone = ['success', 'skipped'].includes(historyMap.get(edge.source) ?? '')
    const targetDone = ['success', 'skipped'].includes(historyMap.get(edge.target) ?? '')
    const traversed = sourceDone && (targetDone || intoCurrent)

    if (intoCurrent || fromPrevious) {
      return {
        ...edge,
        selected: false,
        animated: true,
        className: 'ae-edge-active',
        style: { stroke: '#10b981', strokeWidth: 3.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#10b981',
        },
      }
    }

    if (traversed) {
      return {
        ...edge,
        selected: false,
        animated: false,
        className: 'ae-edge-done',
        style: { stroke: '#34d399', strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#34d399',
        },
      }
    }

    return {
      ...edge,
      ...defaultPlannerEdgeOptions,
      selected: false,
      className: undefined,
      label: edge.label,
    }
  })
}
