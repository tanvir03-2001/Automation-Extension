import type { EdgeRouteInput, NodeBounds } from '@/planner/routing/types'

/** Edges whose source or target is in `nodeIds`. */
export function edgesIncidentToNodes(
  edges: EdgeRouteInput[],
  nodeIds: ReadonlySet<string>,
): Set<string> {
  const dirty = new Set<string>()
  for (const edge of edges) {
    if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
      dirty.add(edge.id)
    }
  }
  return dirty
}

/** Nodes that moved or resized compared to a previous snapshot. */
export function changedNodeIds(
  prev: NodeBounds[],
  next: NodeBounds[],
): Set<string> {
  const prevMap = new Map(prev.map((n) => [n.id, n]))
  const changed = new Set<string>()
  const nextIds = new Set(next.map((n) => n.id))

  for (const n of next) {
    const p = prevMap.get(n.id)
    if (!p) {
      changed.add(n.id)
      continue
    }
    if (
      Math.abs(p.x - n.x) > 0.5 ||
      Math.abs(p.y - n.y) > 0.5 ||
      Math.abs(p.width - n.width) > 0.5 ||
      Math.abs(p.height - n.height) > 0.5
    ) {
      changed.add(n.id)
    }
  }
  for (const p of prev) {
    if (!nextIds.has(p.id)) changed.add(p.id)
  }
  return changed
}

export function edgeIdsChanged(
  prev: EdgeRouteInput[],
  next: EdgeRouteInput[],
): Set<string> {
  const dirty = new Set<string>()
  const prevMap = new Map(prev.map((e) => [e.id, e]))
  const nextIds = new Set(next.map((e) => e.id))

  for (const e of next) {
    const p = prevMap.get(e.id)
    if (!p) {
      dirty.add(e.id)
      continue
    }
    if (
      p.source !== e.source ||
      p.target !== e.target ||
      Math.abs(p.sourceX - e.sourceX) > 0.5 ||
      Math.abs(p.sourceY - e.sourceY) > 0.5 ||
      Math.abs(p.targetX - e.targetX) > 0.5 ||
      Math.abs(p.targetY - e.targetY) > 0.5
    ) {
      dirty.add(e.id)
    }
  }
  for (const p of prev) {
    if (!nextIds.has(p.id)) dirty.add(p.id)
  }
  return dirty
}
