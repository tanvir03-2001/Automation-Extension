import {
  listFallbackCandidates,
  pathAvoidsObstacles,
  pathClearsWithPortStubs,
  portClearanceStub,
  routeFallbackOrthogonal,
  routeOrthogonal,
  simplifyOrthogonal,
} from '@/planner/routing/grid-router'
import { changedNodeIds, edgeIdsChanged, edgesIncidentToNodes } from '@/planner/routing/invalidate'
import { assignLaneOffsets, buildOverlapSoftCost } from '@/planner/routing/lane-offsets'
import { buildObstacles, nodeToPaddedRect } from '@/planner/routing/obstacles'
import { pointsToSimplePath, pointsToSvgPath } from '@/planner/routing/path-svg'
import { cleanOrthogonalPath, scoreRouteCandidate } from '@/planner/routing/simplify-path'
import {
  GRID_CELL,
  MIN_LANE_GAP,
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

function estimateStubSegCounts(
  edge: EdgeRouteInput,
  nodes: NodeBounds[],
): { headSegs: number; tailSegs: number } {
  const obstacles = buildObstacles(nodes)
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)
  const sourceRect = sourceNode ? nodeToPaddedRect(sourceNode) : undefined
  const targetRect = targetNode ? nodeToPaddedRect(targetNode) : undefined
  const { stub: head } = portClearanceStub(
    { x: edge.sourceX, y: edge.sourceY },
    edge.sourcePosition ?? 'right',
    sourceRect,
    obstacles,
  )
  const { stub: tailOut } = portClearanceStub(
    { x: edge.targetX, y: edge.targetY },
    edge.targetPosition ?? 'left',
    targetRect,
    obstacles,
  )
  return {
    headSegs: segmentCount(head),
    tailSegs: segmentCount([...tailOut].reverse()),
  }
}

/** Stable geometric order: top-to-bottom, then left-to-right, then shorter first. */
function compareEdgesGeometric(a: EdgeRouteInput, b: EdgeRouteInput): number {
  const ay = (a.sourceY + a.targetY) / 2
  const by = (b.sourceY + b.targetY) / 2
  if (Math.abs(ay - by) > 1) return ay - by
  const ax = (a.sourceX + a.targetX) / 2
  const bx = (b.sourceX + b.targetX) / 2
  if (Math.abs(ax - bx) > 1) return ax - bx
  const alen = Math.abs(a.targetX - a.sourceX) + Math.abs(a.targetY - a.sourceY)
  const blen = Math.abs(b.targetX - b.sourceX) + Math.abs(b.targetY - b.sourceY)
  if (Math.abs(alen - blen) > 1) return alen - blen
  return a.id.localeCompare(b.id)
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

  for (const fb of listFallbackCandidates(freeStart, freeEnd, obstacles)) {
    middleCandidates.push(fb)
  }

  let best: Point[] | null = null
  let bestScore = Infinity

  for (const middle of middleCandidates) {
    const merged = cleanOrthogonalPath(mergePath(head, middle, tailIn), obstacles)
    if (
      !pathClearsWithPortStubs(
        merged,
        obstacles,
        edge.source,
        edge.target,
        headSegs,
        Math.max(tailSegs, 1),
      )
    ) {
      continue
    }
    const score = scoreRouteCandidate(merged, existingPolylines, MIN_LANE_GAP)
    if (score < bestScore) {
      bestScore = score
      best = merged
    }
  }

  if (best) return best

  return cleanOrthogonalPath(
    mergePath(head, routeFallbackOrthogonal(freeStart, freeEnd, obstacles), tailIn),
    obstacles,
  )
}

/**
 * After lane offsets, keep pre-offset path if spaced route clips any padded box
 * outside dedicated source/target port stubs.
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
    const candidateRaw = spaced.get(edge.id) ?? original
    if (!original || !candidateRaw) continue

    const { headSegs, tailSegs } = estimateStubSegCounts(edge, nodes)
    const candidate = cleanOrthogonalPath(candidateRaw, obstacles)
    const ok = pathClearsWithPortStubs(
      candidate,
      obstacles,
      edge.source,
      edge.target,
      Math.max(headSegs, 1),
      Math.max(tailSegs, 1),
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

  const ordered = [...edges].sort(compareEdgesGeometric)
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

  const routes = new Map<string, ComputedRoute>()
  for (const edge of edges) {
    const points = spaced.get(edge.id) ?? polylines.get(edge.id) ?? [
      { x: edge.sourceX, y: edge.sourceY },
      { x: edge.targetX, y: edge.targetY },
    ]
    // Continuous polyline only — no bridge jump arcs or highlight bands at crossings.
    const svgPath = pointsToSvgPath(points)
    routes.set(edge.id, {
      edgeId: edge.id,
      points,
      bridges: [],
      svgPath: svgPath || pointsToSimplePath(points),
      highlightPaths: [],
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
