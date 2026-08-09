import { MarkerType, type Edge, type EdgeTypes, type Node } from '@xyflow/react'
import { getActionById } from '@/planner/actions/catalog'
import { ActionFlowNode } from '@/planner/components/action-node'
import { SmartOrthogonalEdge } from '@/planner/components/edges/smart-orthogonal-edge'
import { latestHistoryStatusMap } from '@/planner/hooks/use-node-run-visual'
import type { ExecutionCheckpoint, PlannerEdge, PlannerNode, PlannerNodeData } from '@/planner/types/plan'

export const plannerNodeTypes = {
  action: ActionFlowNode,
  start: ActionFlowNode,
  end: ActionFlowNode,
}

export const plannerEdgeTypes = {
  smartOrthogonal: SmartOrthogonalEdge,
} satisfies EdgeTypes

const FLOW_ACCENT = '#334155'
const FALLBACK_ACCENT = '#0f766e'

/** Match ActionFlowNode accent: data.color → action.color → flow defaults. */
export function resolveNodeAccentColor(
  node: { type?: string | null; data?: unknown } | undefined | null,
): string {
  if (!node) return FALLBACK_ACCENT
  const data = (node.data ?? {}) as Partial<PlannerNodeData>
  if (typeof data.color === 'string' && data.color.trim()) return data.color
  if (typeof data.actionId === 'string' && data.actionId) {
    const action = getActionById(data.actionId)
    if (action?.color) return action.color
  }
  if (node.type === 'start' || node.type === 'end') return FLOW_ACCENT
  return FALLBACK_ACCENT
}

function edgeMarkers(color: string) {
  return {
    markerStart: undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color,
    },
  }
}

export function edgeStyleForColor(color: string, strokeWidth = 2.5): Partial<Edge> {
  return {
    style: { stroke: color, strokeWidth },
    ...edgeMarkers(color),
  }
}

export const defaultPlannerEdgeOptions: Partial<Edge> = {
  type: 'smartOrthogonal',
  animated: true,
  selectable: true,
  focusable: true,
  reconnectable: true,
  interactionWidth: 28,
  ...edgeStyleForColor('#94a3b8'),
}

export function toFlowNodes(nodes: PlannerNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }))
}

export function toFlowEdges(edges: PlannerEdge[], nodes: PlannerNode[] = []): Edge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const unique: PlannerEdge[] = []
  for (const edge of edges) {
    const key = `${edge.source}|${edge.sourceHandle ?? 'out'}|${edge.target}|${edge.targetHandle ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(edge)
  }

  return unique.map((edge) => {
    const color = resolveNodeAccentColor(nodeById.get(edge.source))
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? 'out',
      targetHandle: edge.targetHandle ?? undefined,
      ...defaultPlannerEdgeOptions,
      ...edgeStyleForColor(color),
      label: edge.label,
      selected: false,
    }
  })
}

export function applyRunEdgeStyles(
  edges: Edge[],
  args: {
    workflowId: string | null
    checkpoint: ExecutionCheckpoint | null
    selectedEdgeId?: string | null
    nodes?: Array<{ id: string; type?: string | null; data?: unknown }>
  },
): Edge[] {
  const { workflowId, checkpoint, selectedEdgeId = null, nodes = [] } = args
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
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
    const sourceNode = nodeById.get(edge.source)
    // When nodes aren't ready yet (first paint), keep the edge's existing stroke
    // instead of painting every route with the fallback teal.
    const existingStroke =
      typeof edge.style?.stroke === 'string' && edge.style.stroke.trim()
        ? edge.style.stroke
        : null
    const accent = sourceNode
      ? resolveNodeAccentColor(sourceNode)
      : (existingStroke ?? FALLBACK_ACCENT)
    const selected = selectedEdgeId ? edge.id === selectedEdgeId : Boolean(edge.selected)
    if (selected) {
      return {
        ...edge,
        type: 'smartOrthogonal',
        selected: true,
        animated: false,
        className: 'ae-edge-selected',
        ...edgeStyleForColor(accent, 3.25),
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
        type: 'smartOrthogonal',
        selected: false,
        animated: true,
        className: 'ae-edge-active',
        ...edgeStyleForColor(accent, 3.25),
      }
    }

    if (traversed) {
      return {
        ...edge,
        type: 'smartOrthogonal',
        selected: false,
        animated: false,
        className: 'ae-edge-done',
        ...edgeStyleForColor(accent, 2.5),
      }
    }

    return {
      ...edge,
      type: 'smartOrthogonal',
      animated: defaultPlannerEdgeOptions.animated,
      selectable: true,
      focusable: true,
      reconnectable: true,
      interactionWidth: 28,
      selected: false,
      className: undefined,
      label: edge.label,
      ...edgeStyleForColor(accent),
    }
  })
}
