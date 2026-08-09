import {
  exitToClearance,
  pointInRect,
  segmentHitsRect,
  type Side,
} from '@/planner/routing/obstacles'
import { GRID_CELL, type Point, type Rect } from '@/planner/routing/types'

type GridKey = string
type SoftCostFn = (gx: number, gy: number, worldX: number, worldY: number) => number

function key(gx: number, gy: number): GridKey {
  return `${gx},${gy}`
}

function toGrid(x: number, y: number, originX: number, originY: number, cell: number) {
  return {
    gx: Math.round((x - originX) / cell),
    gy: Math.round((y - originY) / cell),
  }
}

function fromGrid(gx: number, gy: number, originX: number, originY: number, cell: number): Point {
  return { x: originX + gx * cell, y: originY + gy * cell }
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

/** Find nearest free point outside all obstacles (Manhattan), scanning a diamond. */
export function nearestFreePoint(
  p: Point,
  obstacles: Rect[],
  cell = GRID_CELL,
  maxRadius = 60,
): Point {
  if (!obstacles.some((o) => pointInRect(p.x, p.y, o))) return p

  for (let r = 1; r <= maxRadius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const dy = r - Math.abs(dx)
      const candidates = [
        { x: p.x + dx * cell, y: p.y + dy * cell },
        { x: p.x + dx * cell, y: p.y - dy * cell },
      ]
      for (const c of candidates) {
        if (!obstacles.some((o) => pointInRect(c.x, c.y, o))) return c
      }
    }
  }

  let minX = p.x
  let minY = p.y
  let maxX = p.x
  let maxY = p.y
  for (const o of obstacles) {
    minX = Math.min(minX, o.x)
    minY = Math.min(minY, o.y)
    maxX = Math.max(maxX, o.x + o.width)
    maxY = Math.max(maxY, o.y + o.height)
  }
  return { x: minX - cell * 2, y: p.y }
}

/**
 * Find a free clearance point just outside `ownRect` on `side`.
 * Prefers axis-aligned exit; if another obstacle blocks, slides along that face
 * with perpendicular offset (extra bends OK) instead of tunneling through neighbors.
 */
export function clearPortPoint(
  handle: Point,
  side: Side,
  ownRect: Rect | undefined,
  obstacles: Rect[],
  step = 8,
): Point {
  const base = ownRect ? exitToClearance(handle, side, ownRect) : { ...handle }
  if (!obstacles.some((o) => pointInRect(base.x, base.y, o))) return base

  const along: Point =
    side === 'right'
      ? { x: 1, y: 0 }
      : side === 'left'
        ? { x: -1, y: 0 }
        : side === 'top'
          ? { x: 0, y: -1 }
          : { x: 0, y: 1 }
  const perps: Point[] =
    side === 'left' || side === 'right'
      ? [
          { x: 0, y: -1 },
          { x: 0, y: 1 },
        ]
      : [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
        ]

  for (let depth = 0; depth <= 48; depth += 1) {
    const alongPt = {
      x: base.x + along.x * depth * step,
      y: base.y + along.y * depth * step,
    }
    for (const pe of perps) {
      for (let lat = 0; lat <= 40; lat += 1) {
        const c = {
          x: alongPt.x + pe.x * lat * step,
          y: alongPt.y + pe.y * lat * step,
        }
        if (!obstacles.some((o) => pointInRect(c.x, c.y, o))) return c
      }
    }
  }

  return nearestFreePoint(base, obstacles)
}

/** Orthogonal stub from handle to clearance (1–2 segments). */
export function portStubPath(handle: Point, clearance: Point): Point[] {
  if (Math.abs(handle.x - clearance.x) < 0.5 || Math.abs(handle.y - clearance.y) < 0.5) {
    return simplifyOrthogonal([handle, clearance])
  }
  // L via handle axis first (exit along port), then lateral
  return simplifyOrthogonal([handle, { x: clearance.x, y: handle.y }, clearance])
}

/**
 * Port stub: handle → free clearance outside that node's padded box on the handle side.
 * Only these stub segments may touch the source/target padded rect.
 */
export function portClearanceStub(
  handle: Point,
  side: Side,
  nodeObstacle: Rect | undefined,
  allObstacles: Rect[],
): { clearance: Point; stub: Point[] } {
  const clearance = clearPortPoint(handle, side, nodeObstacle, allObstacles)
  return {
    clearance,
    stub: portStubPath(handle, clearance),
  }
}

/** Orthogonal connector in free space only (both endpoints must be outside obstacles). */
export function connectAvoiding(from: Point, to: Point, obstacles: Rect[]): Point[] {
  if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5) return [from]

  const direct = simplifyOrthogonal([from, { x: to.x, y: from.y }, to])
  if (pathAvoidsObstacles(direct, obstacles)) return direct
  const direct2 = simplifyOrthogonal([from, { x: from.x, y: to.y }, to])
  if (pathAvoidsObstacles(direct2, obstacles)) return direct2
  return routeFallbackOrthogonal(from, to, obstacles)
}

/**
 * Orthogonal A* on a coarse grid. Obstacles are hard-blocked.
 * Soft costs discourage overlap with existing routes and extra bends.
 * Start/end must already be in free space (port stubs handled separately).
 */
export function routeOrthogonal(
  start: Point,
  end: Point,
  obstacles: Rect[],
  options?: {
    cell?: number
    softCost?: SoftCostFn
    maxExpand?: number
  },
): Point[] | null {
  const cell = options?.cell ?? GRID_CELL
  const softCost = options?.softCost
  const maxExpand = options?.maxExpand ?? 24_000

  let minX = Math.min(start.x, end.x) - cell * 16
  let minY = Math.min(start.y, end.y) - cell * 16
  let maxX = Math.max(start.x, end.x) + cell * 16
  let maxY = Math.max(start.y, end.y) + cell * 16
  for (const o of obstacles) {
    minX = Math.min(minX, o.x - cell * 6)
    minY = Math.min(minY, o.y - cell * 6)
    maxX = Math.max(maxX, o.x + o.width + cell * 6)
    maxY = Math.max(maxY, o.y + o.height + cell * 6)
  }

  const originX = minX
  const originY = minY

  const cellBlocked = (gx: number, gy: number): boolean => {
    const p = fromGrid(gx, gy, originX, originY, cell)
    if (p.x < minX - cell || p.x > maxX + cell || p.y < minY - cell || p.y > maxY + cell) {
      return true
    }
    return obstacles.some((o) => pointInRect(p.x, p.y, o))
  }

  /** Nearest free grid cell; prefers cells aligned on an axis with `from`. */
  const snapFreeGrid = (from: Point): { gx: number; gy: number; p: Point } => {
    const base = toGrid(from.x, from.y, originX, originY, cell)
    for (let r = 0; r <= 12; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const rest = r - Math.abs(dx)
        for (const dy of rest === 0 ? [0] : [rest, -rest]) {
          const gx = base.gx + dx
          const gy = base.gy + dy
          if (cellBlocked(gx, gy)) continue
          const p = fromGrid(gx, gy, originX, originY, cell)
          // Prefer snap that stays orthogonal via a single L from `from`
          const viaH = [from, { x: p.x, y: from.y }, p]
          const viaV = [from, { x: from.x, y: p.y }, p]
          if (pathAvoidsObstacles(viaH, obstacles) || pathAvoidsObstacles(viaV, obstacles)) {
            return { gx, gy, p }
          }
        }
      }
    }
    const p = fromGrid(base.gx, base.gy, originX, originY, cell)
    return { gx: base.gx, gy: base.gy, p }
  }

  const sgSnap = snapFreeGrid(start)
  const egSnap = snapFreeGrid(end)
  const sg = { gx: sgSnap.gx, gy: sgSnap.gy }
  const eg = { gx: egSnap.gx, gy: egSnap.gy }

  const blocked = (gx: number, gy: number): boolean => {
    if ((gx === sg.gx && gy === sg.gy) || (gx === eg.gx && gy === eg.gy)) return false
    return cellBlocked(gx, gy)
  }

  type Rec = { g: number; f: number; px: number; py: number; dir: number }
  const best = new Map<GridKey, Rec>()
  const open: { gx: number; gy: number; f: number }[] = []

  const sk = key(sg.gx, sg.gy)
  const h0 = heuristic(sg.gx, sg.gy, eg.gx, eg.gy)
  best.set(sk, { g: 0, f: h0, px: sg.gx, py: sg.gy, dir: 0 })
  open.push({ gx: sg.gx, gy: sg.gy, f: h0 })

  const dirs = [
    { dx: 1, dy: 0, dir: 1 },
    { dx: -1, dy: 0, dir: 2 },
    { dx: 0, dy: -1, dir: 3 },
    { dx: 0, dy: 1, dir: 4 },
  ]

  let expansions = 0
  let found = false

  while (open.length > 0 && expansions < maxExpand) {
    expansions += 1
    let bestIdx = 0
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestIdx].f) bestIdx = i
    }
    const cur = open[bestIdx]
    open[bestIdx] = open[open.length - 1]
    open.pop()

    const ck = key(cur.gx, cur.gy)
    const crec = best.get(ck)
    if (!crec || cur.f > crec.f + 0.01) continue

    if (cur.gx === eg.gx && cur.gy === eg.gy) {
      found = true
      break
    }

    for (const d of dirs) {
      const nx = cur.gx + d.dx
      const ny = cur.gy + d.dy
      if (blocked(nx, ny)) continue

      const a = fromGrid(cur.gx, cur.gy, originX, originY, cell)
      const b = fromGrid(nx, ny, originX, originY, cell)
      let hits = false
      for (const o of obstacles) {
        if (segmentHitsRect(a.x, a.y, b.x, b.y, o)) {
          hits = true
          break
        }
      }
      if (hits) continue

      const bendPenalty = crec.dir !== 0 && crec.dir !== d.dir ? 5.5 : 0
      const soft = softCost ? softCost(nx, ny, b.x, b.y) : 0
      const g = crec.g + 1 + bendPenalty + soft
      const f = g + heuristic(nx, ny, eg.gx, eg.gy)
      const nk = key(nx, ny)
      const existing = best.get(nk)
      if (existing && existing.g <= g) continue
      best.set(nk, { g, f, px: cur.gx, py: cur.gy, dir: d.dir })
      open.push({ gx: nx, gy: ny, f })
    }
  }

  if (!found) return null

  const gridPath: { gx: number; gy: number }[] = []
  let cx = eg.gx
  let cy = eg.gy
  for (let guard = 0; guard < maxExpand; guard += 1) {
    gridPath.push({ gx: cx, gy: cy })
    if (cx === sg.gx && cy === sg.gy) break
    const rec = best.get(key(cx, cy))
    if (!rec) break
    if (rec.px === cx && rec.py === cy) break
    cx = rec.px
    cy = rec.py
  }
  gridPath.reverse()

  // Grid-to-grid core, then orthogonal stubs from real start/end onto snapped cells.
  const gridPoints: Point[] = []
  for (const g of gridPath) {
    const p = fromGrid(g.gx, g.gy, originX, originY, cell)
    const last = gridPoints[gridPoints.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    gridPoints.push(p)
  }

  const joinOrtho = (from: Point, to: Point): Point[] => {
    if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5) return [from]
    if (Math.abs(from.x - to.x) < 0.5 || Math.abs(from.y - to.y) < 0.5) return [from, to]
    const viaH = [from, { x: to.x, y: from.y }, to]
    if (pathAvoidsObstacles(viaH, obstacles)) return viaH
    const viaV = [from, { x: from.x, y: to.y }, to]
    if (pathAvoidsObstacles(viaV, obstacles)) return viaV
    return viaH
  }

  const head = joinOrtho(start, sgSnap.p)
  const tail = joinOrtho(egSnap.p, end)
  const points: Point[] = []
  for (const p of head) {
    const last = points[points.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    points.push(p)
  }
  for (const p of gridPoints) {
    const last = points[points.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    points.push(p)
  }
  for (const p of tail) {
    const last = points[points.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    points.push(p)
  }

  return simplifyOrthogonal(points)
}

/** Collapse colinear points into a clean orthogonal polyline. */
export function simplifyOrthogonal(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice()
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1]
    const cur = points[i]
    const next = points[i + 1]
    const colinearH = Math.abs(prev.y - cur.y) < 0.5 && Math.abs(cur.y - next.y) < 0.5
    const colinearV = Math.abs(prev.x - cur.x) < 0.5 && Math.abs(cur.x - next.x) < 0.5
    if (colinearH || colinearV) continue
    out.push(cur)
  }
  out.push(points[points.length - 1])
  return out
}

export function pathAvoidsObstacles(
  points: Point[],
  obstacles: Rect[],
  options?: { ignoreEnds?: boolean },
): boolean {
  const ignoreEnds = options?.ignoreEnds ?? false
  const start = ignoreEnds ? 1 : 0
  const end = ignoreEnds ? points.length - 2 : points.length - 1
  for (let i = start; i < end; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    for (const o of obstacles) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, o)) return false
    }
  }
  return true
}

/**
 * Every segment must clear all padded boxes, except:
 * - first `headSegCount` segments may only touch the source obstacle
 * - last `tailSegCount` segments may only touch the target obstacle
 */
export function pathClearsWithPortStubs(
  points: Point[],
  obstacles: Rect[],
  sourceId: string,
  targetId: string,
  headSegCount: number,
  tailSegCount: number,
): boolean {
  if (points.length < 2) return true
  const segCount = points.length - 1
  const headN = Math.max(0, Math.min(headSegCount, segCount))
  const tailN = Math.max(0, Math.min(tailSegCount, segCount))

  for (let i = 0; i < segCount; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const inHead = i < headN
    const inTail = i >= segCount - tailN

    for (const o of obstacles) {
      if (!segmentHitsRect(a.x, a.y, b.x, b.y, o)) continue
      if (inHead && o.id === sourceId) continue
      if (inTail && o.id === targetId) continue
      return false
    }
  }
  return true
}

/**
 * Interior polyline (skip first/last port stub segments) must clear every padded box.
 * @deprecated prefer pathClearsWithPortStubs
 */
export function pathClearsNodes(
  points: Point[],
  obstacles: Rect[],
  stubSegments = 1,
): boolean {
  if (points.length < 2) return true
  const start = Math.min(stubSegments, points.length - 1)
  const end = Math.max(start, points.length - 1 - stubSegments)
  for (let i = start; i < end; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    for (const o of obstacles) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, o)) return false
    }
  }
  return true
}

/** @deprecated use pathClearsNodes — kept for callers that check unpadded cores */
export function pathAvoidsCoreBoxes(
  points: Point[],
  nodes: { id: string; x: number; y: number; width: number; height: number }[],
  excludeIds: ReadonlySet<string>,
): boolean {
  for (let i = 1; i < points.length - 2; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    for (const n of nodes) {
      if (excludeIds.has(n.id)) continue
      const r = { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }
      if (segmentHitsRect(a.x, a.y, b.x, b.y, r)) return false
    }
  }
  return true
}

export function pathLength(points: Point[]): number {
  let len = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    len +=
      Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y)
  }
  return len
}

function obstacleUnion(obstacles: Rect[], start: Point, end: Point) {
  let top = Math.min(start.y, end.y)
  let bottom = Math.max(start.y, end.y)
  let left = Math.min(start.x, end.x)
  let right = Math.max(start.x, end.x)
  for (const o of obstacles) {
    top = Math.min(top, o.y)
    bottom = Math.max(bottom, o.y + o.height)
    left = Math.min(left, o.x)
    right = Math.max(right, o.x + o.width)
  }
  return { top, bottom, left, right }
}

/** Obstacles that overlap the axis-aligned corridor between start and end (plus margin). */
export function obstaclesInCorridor(
  obstacles: Rect[],
  start: Point,
  end: Point,
  margin = GRID_CELL * 8,
): Rect[] {
  const minX = Math.min(start.x, end.x) - margin
  const maxX = Math.max(start.x, end.x) + margin
  const minY = Math.min(start.y, end.y) - margin
  const maxY = Math.max(start.y, end.y) + margin
  return obstacles.filter(
    (o) =>
      !(o.x + o.width < minX || o.x > maxX || o.y + o.height < minY || o.y > maxY),
  )
}

function pushWrapTemplates(
  raw: Point[][],
  start: Point,
  end: Point,
  top: number,
  bottom: number,
  left: number,
  right: number,
  pad: number,
) {
  const corridorYTop = top - pad
  const corridorYBot = bottom + pad
  const corridorXLeft = left - pad
  const corridorXRight = right + pad

  for (const y of [corridorYTop, corridorYBot]) {
    raw.push([
      start,
      { x: corridorXLeft, y: start.y },
      { x: corridorXLeft, y },
      { x: corridorXRight, y },
      { x: corridorXRight, y: end.y },
      end,
    ])
    raw.push([
      start,
      { x: corridorXRight, y: start.y },
      { x: corridorXRight, y },
      { x: corridorXLeft, y },
      { x: corridorXLeft, y: end.y },
      end,
    ])
    raw.push([start, { x: start.x, y }, { x: end.x, y }, end])
  }
  for (const x of [corridorXLeft, corridorXRight]) {
    raw.push([start, { x, y: start.y }, { x, y: end.y }, end])
  }
  raw.push([start, { x: start.x, y: corridorYTop }, { x: end.x, y: corridorYTop }, end])
  raw.push([start, { x: start.x, y: corridorYBot }, { x: end.x, y: corridorYBot }, end])
  raw.push([start, { x: corridorXLeft, y: start.y }, { x: corridorXLeft, y: end.y }, end])
  raw.push([start, { x: corridorXRight, y: start.y }, { x: corridorXRight, y: end.y }, end])
}

/**
 * Short local + corridor wraps, validated against ALL obstacles.
 * Prefer local start–end bbox / corridor obstacles over full-canvas union.
 */
export function listFallbackCandidates(start: Point, end: Point, obstacles: Rect[]): Point[][] {
  const raw: Point[][] = []
  const pad = GRID_CELL * 2
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  raw.push([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end])
  raw.push([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end])
  raw.push([start, { x: end.x, y: start.y }, end])
  raw.push([start, { x: start.x, y: end.y }, end])

  const localTop = Math.min(start.y, end.y)
  const localBot = Math.max(start.y, end.y)
  const localLeft = Math.min(start.x, end.x)
  const localRight = Math.max(start.x, end.x)
  pushWrapTemplates(raw, start, end, localTop, localBot, localLeft, localRight, pad)

  const localObs = obstaclesInCorridor(obstacles, start, end, GRID_CELL * 10)
  if (localObs.length > 0) {
    const u = obstacleUnion(localObs, start, end)
    pushWrapTemplates(raw, start, end, u.top, u.bottom, u.left, u.right, pad)
  }

  for (const o of localObs) {
    const t = o.y - pad
    const b = o.y + o.height + pad
    const l = o.x - pad
    const r = o.x + o.width + pad
    raw.push([start, { x: start.x, y: t }, { x: end.x, y: t }, end])
    raw.push([start, { x: start.x, y: b }, { x: end.x, y: b }, end])
    raw.push([start, { x: l, y: start.y }, { x: l, y: end.y }, end])
    raw.push([start, { x: r, y: start.y }, { x: r, y: end.y }, end])
    raw.push([start, { x: start.x, y: t }, { x: r, y: t }, { x: r, y: end.y }, end])
    raw.push([start, { x: start.x, y: b }, { x: l, y: b }, { x: l, y: end.y }, end])
  }

  const valid: { path: Point[]; len: number }[] = []
  const seen = new Set<string>()
  for (const path of raw) {
    const clean = simplifyOrthogonal(path)
    const key = clean.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    if (!pathAvoidsObstacles(clean, obstacles)) continue
    valid.push({ path: clean, len: pathLength(clean) })
  }
  valid.sort((a, b) => a.len - b.len)
  return valid.map((v) => v.path)
}

/**
 * Fallback: shortest local wrap that clears all obstacles.
 */
export function routeFallbackOrthogonal(start: Point, end: Point, obstacles: Rect[]): Point[] {
  const list = listFallbackCandidates(start, end, obstacles)
  if (list.length > 0) return list[0]

  const u = obstacleUnion(obstacles, start, end)
  const pad = GRID_CELL * 3
  return simplifyOrthogonal([
    start,
    { x: u.left - pad, y: start.y },
    { x: u.left - pad, y: u.top - pad },
    { x: u.right + pad, y: u.top - pad },
    { x: u.right + pad, y: end.y },
    end,
  ])
}

export { exitToClearance }
export type { Side }
