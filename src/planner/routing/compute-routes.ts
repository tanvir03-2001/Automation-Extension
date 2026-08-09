import { detectCrossings } from '@/planner/routing/crossings'
import {
  listFallbackCandidates,
  pathAvoidsObstacles,
  pathClearsWithPortStubs,
  pathLength,
  portClearanceStub,
  routeFallbackOrthogonal,
  routeOrthogonal,
  simplifyOrthogonal,
} from '@/planner/routing/grid-router'
import { changedNodeIds, edgeIdsChanged, edgesIncidentToNodes } from '@/planner/routing/invalidate'
import { assignLaneOffsets, buildOverlapSoftCost } from '@/planner/routing/lane-offsets'
import { buildObstacles, nodeToPaddedRect } from '@/planner/routing/obstacles'
import {
  bridgeHighlightPaths,
  pointsToSimplePath,
  pointsToSvgPath,
} from '@/planner/routing/path-svg'
import {
  GRID_CELL,
  type ComputedRoute,
  type EdgeRouteInput,
  type NodeBounds,
  type Point,
} from '@/planner/routing/types'

export type RouteComputeResult = {
  routes: Map<string, ComputedRoute>
  version: number
}

function mergePath(prefix: Point[], middle: Point[], suffix: Point[]): Point[] {
  const all = [...prefix]
  for (const p of middle) {
    const last = all[all.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    all.push(p)
  }
  for (const p of suffix) {
    const last = all[all.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    all.push(p)
  }
  return simplifyOrthogonal(all)
}

function segmentCount(poly: Point[]): number {
  return Math.max(0, poly.length - 1)
}

function routeOneEdge(
  edge: EdgeRouteInput,
  nodes: NodeBounds[],
  existingPolylines: Point[][],
): Point[] {
  const start = { x: edge.sourceX, y: edge.sourceY }
  const end = { x: edge.targetX, y: edge.targetY }
  const sourceSide = edge.sourcePosition ?? 'right'
  const targetSide = edge.targetPosition ?? 'left'

  const obstacles = buildObstacles(nodes)

  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)
  const sourceRect = sourceNode ? nodeToPaddedRect(sourceNode) : undefined
  const targetRect = targetNode ? nodeToPaddedRect(targetNode) : undefined

  const { clearance: freeStart, stub: head } = portClearanceStub(
    start,
    sourceSide,
    sourceRect,
    obstacles,
  )
  const { clearance: freeEnd, stub: tailOut } = portClearanceStub(
    end,
    targetSide,
    targetRect,
    obstacles,
  )
  const tailIn = [...tailOut].reverse()
  const headSegs = segmentCount(head)
  const tailSegs = segmentCount(tailIn)

  const middleCandidates: Point[][] = []

  // Prefer pure shortest A* (no soft overlap cost), then soft-cost variant
  const softCost = buildOverlapSoftCost(existingPolylines, GRID_CELL)
  const astarShort = routeOrthogonal(freeStart, freeEnd, obstacles, {
    maxExpand: 24_000,
  })
  if (astarShort && pathAvoidsObstacles(astarShort, obstacles)) {
    middleCandidates.push(astarShort)
  }

  const astarSoft = routeOrthogonal(freeStart, freeEnd, obstacles, {
    softCost,
    maxExpand: 24_000,
  })
  if (astarSoft && pathAvoidsObstacles(astarSoft, obstacles)) {
    middleCandidates.push(astarSoft)
  }

  // Local short wraps (not full-canvas perimeter)
  for (const fb of listFallbackCandidates(freeStart, freeEnd, obstacles)) {
    middleCandidates.push(fb)
  }

  let best: Point[] | null = null
  let bestLen = Infinity

  for (const middle of middleCandidates) {
    const merged = mergePath(head, middle, tailIn)
    if (
      !pathClearsWithPortStubs(
        merged,
        obstacles,
        edge.source,
        edge.target,
        headSegs,
        tailSegs,
      )
    ) {
      continue
    }
    const len = pathLength(merged)
    if (len < bestLen) {
      bestLen = len
      best = merged
    }
  }

  if (best) return best

  return mergePath(head, routeFallbackOrthogonal(freeStart, freeEnd, obstacles), tailIn)
}

/**
 * After lane offsets, keep pre-offset path if spaced route clips any padded box
 * outside dedicated source/target port stubs (estimate 2 segs each end).
 */
function applyLaneOffsetsSafely(
  polylines: Map<string, Point[]>,
  edges: EdgeRouteInput[],
  nodes: NodeBounds[],
): Map<string, Point[]> {
  const spaced = assignLaneOffsets(polylines)
  const result = new Map<string, Point[]>()
  const obstacles = buildObstacles(nodes)

  for (const edge of edges) {
    const original = polylines.get(edge.id)
    const candidate = spaced.get(edge.id) ?? original
    if (!original || !candidate) continue

    const ok = pathClearsWithPortStubs(
      candidate,
      obstacles,
      edge.source,
      edge.target,
      2,
      2,
    )
    result.set(edge.id, ok ? candidate : original)
  }

  return result
}

/**
 * Compute routes for all edges (or a dirty subset). When `dirtyIds` is null, recompute everything.
 */
export function computeRoutes(
  nodes: NodeBounds[],
  edges: EdgeRouteInput[],
  previous: Map<string, ComputedRoute> | null,
  dirtyIds: Set<string> | null,
  version: number,
): RouteComputeResult {
  const polylines = new Map<string, Point[]>()

  if (previous) {
    for (const [id, route] of previous) {
      if (edges.some((e) => e.id === id)) {
        polylines.set(id, route.points)
      }
    }
  }

  const toRoute =
    dirtyIds === null
      ? edges
      : edges.filter((e) => dirtyIds.has(e.id) || !polylines.has(e.id))

  const ordered = [...edges].sort((a, b) => a.id.localeCompare(b.id))
  const routedExisting: Point[][] = []

  for (const edge of ordered) {
    if (!toRoute.some((e) => e.id === edge.id) && polylines.has(edge.id)) {
      routedExisting.push(polylines.get(edge.id)!)
      continue
    }
    const pts = routeOneEdge(edge, nodes, routedExisting)
    polylines.set(edge.id, pts)
    routedExisting.push(pts)
  }

  for (const id of [...polylines.keys()]) {
    if (!edges.some((e) => e.id === id)) polylines.delete(id)
  }

  const spaced = applyLaneOffsetsSafely(polylines, edges, nodes)
  const orderedIds = ordered.map((e) => e.id)
  const bridgesMap = detectCrossings(spaced, orderedIds)

  const routes = new Map<string, ComputedRoute>()
  for (const edge of edges) {
    const points = spaced.get(edge.id) ?? polylines.get(edge.id) ?? [
      { x: edge.sourceX, y: edge.sourceY },
      { x: edge.targetX, y: edge.targetY },
    ]
    const bridges = bridgesMap.get(edge.id) ?? []
    const svgPath = pointsToSvgPath(points, bridges)
    const highlightPaths = bridgeHighlightPaths(points, bridges)
    routes.set(edge.id, {
      edgeId: edge.id,
      points,
      bridges,
      svgPath: svgPath || pointsToSimplePath(points),
      highlightPaths,
    })
  }

  return { routes, version }
}

export function computeDirtySet(
  prevNodes: NodeBounds[],
  nextNodes: NodeBounds[],
  prevEdges: EdgeRouteInput[],
  nextEdges: EdgeRouteInput[],
  dragging: boolean,
): Set<string> | null {
  const nodeChanges = changedNodeIds(prevNodes, nextNodes)
  const edgeChanges = edgeIdsChanged(prevEdges, nextEdges)

  if (!dragging && (nodeChanges.size > 3 || edgeChanges.size > 5)) {
    return null
  }

  const dirty = new Set<string>(edgeChanges)
  for (const id of edgesIncidentToNodes(nextEdges, nodeChanges)) {
    dirty.add(id)
  }

  for (const e of nextEdges) {
    if (!prevEdges.some((p) => p.id === e.id)) dirty.add(e.id)
  }

  return dirty
}

export type { EdgeRouteInput, NodeBounds, ComputedRoute }
