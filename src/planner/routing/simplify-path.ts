import { pathAvoidsObstacles, simplifyOrthogonal } from '@/planner/routing/grid-router'
import type { Point, Rect } from '@/planner/routing/types'

const EPS = 0.5

function almostEq(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS
}

function isOrthogonalSeg(a: Point, b: Point): boolean {
  return almostEq(a.x, b.x) || almostEq(a.y, b.y)
}

function isDiagonalSeg(a: Point, b: Point): boolean {
  return !almostEq(a.x, b.x) && !almostEq(a.y, b.y)
}

/** Count 90° bends on an orthogonal polyline. */
export function countBends(points: Point[]): number {
  if (points.length < 3) return 0
  let bends = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const inH = almostEq(prev.y, cur.y)
    const inV = almostEq(prev.x, cur.x)
    const outH = almostEq(cur.y, next.y)
    const outV = almostEq(cur.x, next.x)
    if ((inH && outV) || (inV && outH)) bends += 1
    else if (isDiagonalSeg(prev, cur) || isDiagonalSeg(cur, next)) bends += 1
  }
  return bends
}

/**
 * Expand diagonal segments into L-shapes, preferring the free elbow.
 * Keeps endpoints fixed.
 */
export function orthogonalizePath(points: Point[], obstacles: Rect[]): Point[] {
  if (points.length < 2) return points.slice()
  const out: Point[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1]
    const cur = points[i]
    if (almostEq(prev.x, cur.x) && almostEq(prev.y, cur.y)) continue
    if (isOrthogonalSeg(prev, cur)) {
      out.push({ ...cur })
      continue
    }
    const viaH: Point[] = [prev, { x: cur.x, y: prev.y }, cur]
    const viaV: Point[] = [prev, { x: prev.x, y: cur.y }, cur]
    const hOk = pathAvoidsObstacles(viaH, obstacles)
    const vOk = pathAvoidsObstacles(viaV, obstacles)
    if (hOk && !vOk) {
      out.push({ x: cur.x, y: prev.y }, { ...cur })
    } else if (vOk && !hOk) {
      out.push({ x: prev.x, y: cur.y }, { ...cur })
    } else {
      // Prefer horizontal-first L (or force one if both blocked).
      out.push({ x: cur.x, y: prev.y }, { ...cur })
    }
  }
  return simplifyOrthogonal(out)
}

/**
 * Collapse H–V–H / V–H–V staircases into a single bend when the shortcut is free.
 */
export function collapseStaircases(points: Point[], obstacles: Rect[]): Point[] {
  let pts = simplifyOrthogonal(points)
  let changed = true
  let guard = 0
  while (changed && guard < 32) {
    changed = false
    guard += 1
    if (pts.length < 4) break

    for (let i = 0; i < pts.length - 3; i += 1) {
      const a = pts[i]
      const b = pts[i + 1]
      const c = pts[i + 2]
      const d = pts[i + 3]

      const hvh =
        almostEq(a.y, b.y) &&
        almostEq(b.x, c.x) &&
        almostEq(c.y, d.y) &&
        !almostEq(a.y, d.y)
      if (hvh) {
        const shortcut = simplifyOrthogonal([a, { x: d.x, y: a.y }, d])
        if (pathAvoidsObstacles(shortcut, obstacles)) {
          pts = simplifyOrthogonal([...pts.slice(0, i + 1), { x: d.x, y: a.y }, ...pts.slice(i + 3)])
          changed = true
          break
        }
        const alt = simplifyOrthogonal([a, { x: a.x, y: d.y }, d])
        if (pathAvoidsObstacles(alt, obstacles)) {
          pts = simplifyOrthogonal([...pts.slice(0, i + 1), { x: a.x, y: d.y }, ...pts.slice(i + 3)])
          changed = true
          break
        }
      }

      const vhv =
        almostEq(a.x, b.x) &&
        almostEq(b.y, c.y) &&
        almostEq(c.x, d.x) &&
        !almostEq(a.x, d.x)
      if (vhv) {
        const shortcut = simplifyOrthogonal([a, { x: a.x, y: d.y }, d])
        if (pathAvoidsObstacles(shortcut, obstacles)) {
          pts = simplifyOrthogonal([...pts.slice(0, i + 1), { x: a.x, y: d.y }, ...pts.slice(i + 3)])
          changed = true
          break
        }
        const alt = simplifyOrthogonal([a, { x: d.x, y: a.y }, d])
        if (pathAvoidsObstacles(alt, obstacles)) {
          pts = simplifyOrthogonal([...pts.slice(0, i + 1), { x: d.x, y: a.y }, ...pts.slice(i + 3)])
          changed = true
          break
        }
      }
    }
  }
  return pts
}

/** Orthogonalize diagonals then collapse stairs. */
export function cleanOrthogonalPath(points: Point[], obstacles: Rect[]): Point[] {
  return collapseStaircases(orthogonalizePath(points, obstacles), obstacles)
}

/**
 * Rough parallel-overlap measure: sampled points near existing same-axis runs.
 * Higher = worse for scoring.
 */
export function parallelOverlapScore(
  path: Point[],
  existing: Point[][],
  gap: number,
): number {
  if (path.length < 2 || existing.length === 0) return 0
  let score = 0
  const sampleStep = Math.max(8, gap * 0.5)

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.abs(dx) + Math.abs(dy)
    if (len < 1) continue
    const axis: 'h' | 'v' = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
    const steps = Math.max(1, Math.ceil(len / sampleStep))

    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const x = a.x + dx * t
      const y = a.y + dy * t

      for (const other of existing) {
        for (let j = 0; j < other.length - 1; j += 1) {
          const oa = other[j]
          const ob = other[j + 1]
          const odx = Math.abs(ob.x - oa.x)
          const ody = Math.abs(ob.y - oa.y)
          if (odx + ody < 1) continue
          const oAxis: 'h' | 'v' = odx >= ody ? 'h' : 'v'
          if (oAxis !== axis) continue

          if (axis === 'h') {
            const yDist = Math.abs(y - (oa.y + ob.y) / 2)
            if (yDist > gap) continue
            const minX = Math.min(oa.x, ob.x) - gap * 0.25
            const maxX = Math.max(oa.x, ob.x) + gap * 0.25
            if (x >= minX && x <= maxX) {
              score += 1 + (gap - yDist) / gap
            }
          } else {
            const xDist = Math.abs(x - (oa.x + ob.x) / 2)
            if (xDist > gap) continue
            const minY = Math.min(oa.y, ob.y) - gap * 0.25
            const maxY = Math.max(oa.y, ob.y) + gap * 0.25
            if (y >= minY && y <= maxY) {
              score += 1 + (gap - xDist) / gap
            }
          }
        }
      }
    }
  }
  return score
}

/** Multi-objective route score (lower is better). */
export function scoreRouteCandidate(
  path: Point[],
  existing: Point[][],
  gap: number,
  weights?: { bend?: number; overlap?: number },
): number {
  const wBend = weights?.bend ?? 48
  const wOverlap = weights?.overlap ?? 22
  let len = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    len +=
      Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y)
  }
  return len + wBend * countBends(path) + wOverlap * parallelOverlapScore(path, existing, gap)
}
