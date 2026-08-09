import {
  BRIDGE_HIGHLIGHT_PX,
  BRIDGE_RADIUS,
  CORNER_RADIUS,
  type BridgeJump,
  type Point,
} from '@/planner/routing/types'

function almostEqual(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) < eps
}

type Cmd =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'A'; r: number; sweep: 0 | 1; x: number; y: number }
  | { type: 'Q'; cx: number; cy: number; x: number; y: number }

function emit(cmds: Cmd[]): string {
  let d = ''
  for (const c of cmds) {
    if (c.type === 'M') d += `M ${c.x} ${c.y} `
    else if (c.type === 'L') d += `L ${c.x} ${c.y} `
    else if (c.type === 'A') d += `A ${c.r} ${c.r} 0 0 ${c.sweep} ${c.x} ${c.y} `
    else d += `Q ${c.cx} ${c.cy} ${c.x} ${c.y} `
  }
  return d.trim()
}

function totalLength(points: Point[]): number {
  let len = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    len +=
      Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y)
  }
  return len
}

/** Point at distance `dist` along an orthogonal polyline. */
function pointAtDistance(points: Point[], dist: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (dist <= 0) return { ...points[0] }
  let acc = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const seg =
      Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (acc + seg >= dist) {
      const t = seg < 0.001 ? 0 : (dist - acc) / seg
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      }
    }
    acc += seg
  }
  return { ...points[points.length - 1] }
}

/**
 * Build an SVG path for an orthogonal polyline with rounded corners
 * and semicircle bridge jumps at crossings.
 */
export function pointsToSvgPath(points: Point[], bridges: BridgeJump[] = []): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const pts = points.map((p) => ({ ...p }))
  const sortedBridges = bridges.slice().sort((a, b) => a.at - b.at)
  const cmds: Cmd[] = [{ type: 'M', x: pts[0].x, y: pts[0].y }]

  let distAcc = 0
  let cursor = { x: pts[0].x, y: pts[0].y }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = { ...cursor }
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || Math.abs(dx) + Math.abs(dy)
    const horizontal = almostEqual(a.y, b.y)
    const vertical = almostEqual(a.x, b.x)

    let end = { x: b.x, y: b.y }
    let corner: { cx: number; cy: number; after: Point } | null = null
    if (i < pts.length - 2) {
      const c = pts[i + 2]
      const nextLen = Math.abs(c.x - b.x) + Math.abs(c.y - b.y)
      const r = Math.min(CORNER_RADIUS, len / 2 - 0.5, nextLen / 2 - 0.5)
      if (r > 1.5) {
        if (horizontal && almostEqual(b.x, c.x)) {
          const sx = Math.sign(dx || 1)
          const sy = Math.sign(c.y - b.y || 1)
          end = { x: b.x - sx * r, y: b.y }
          corner = { cx: b.x, cy: b.y, after: { x: b.x, y: b.y + sy * r } }
        } else if (vertical && almostEqual(b.y, c.y)) {
          const sy = Math.sign(dy || 1)
          const sx = Math.sign(c.x - b.x || 1)
          end = { x: b.x, y: b.y - sy * r }
          corner = { cx: b.x, cy: b.y, after: { x: b.x + sx * r, y: b.y } }
        }
      }
    }

    const segBridges = sortedBridges.filter(
      (br) => br.at >= distAcc - 0.5 && br.at <= distAcc + len + 0.5,
    )
    segBridges.sort((br1, br2) => {
      if (horizontal) return Math.sign(dx || 1) * (br1.x - br2.x)
      return Math.sign(dy || 1) * (br1.y - br2.y)
    })

    for (const br of segBridges) {
      const r = BRIDGE_RADIUS
      if (horizontal) {
        const sx = Math.sign(dx || 1)
        const beforeX = br.x - sx * r
        cmds.push({ type: 'L', x: beforeX, y: a.y })
        const sweep: 0 | 1 = sx >= 0 ? 1 : 0
        cmds.push({ type: 'A', r, sweep, x: br.x + sx * r, y: a.y })
        cursor = { x: br.x + sx * r, y: a.y }
      } else if (vertical) {
        const sy = Math.sign(dy || 1)
        const beforeY = br.y - sy * r
        cmds.push({ type: 'L', x: a.x, y: beforeY })
        const sweep: 0 | 1 = sy >= 0 ? 0 : 1
        cmds.push({ type: 'A', r, sweep, x: a.x, y: br.y + sy * r })
        cursor = { x: a.x, y: br.y + sy * r }
      }
    }

    cmds.push({ type: 'L', x: end.x, y: end.y })
    cursor = end

    if (corner) {
      cmds.push({ type: 'Q', cx: corner.cx, cy: corner.cy, x: corner.after.x, y: corner.after.y })
      cursor = corner.after
      pts[i + 1] = corner.after
    }

    distAcc += len
  }

  return emit(cmds)
}

/**
 * Build a short highlight path around a bridge: from (at - pad) through the jump arc to (at + pad).
 */
export function bridgeHighlightPath(
  points: Point[],
  bridge: BridgeJump,
  pad = BRIDGE_HIGHLIGHT_PX,
): string {
  if (points.length < 2) return ''

  const total = totalLength(points)
  const fromDist = Math.max(0, bridge.at - pad)
  const toDist = Math.min(total, bridge.at + pad)
  if (toDist - fromDist < 2) return ''

  const start = pointAtDistance(points, fromDist)
  const end = pointAtDistance(points, toDist)
  const r = BRIDGE_RADIUS

  // Prefer stored axis; fall back to geometry of the highlight span
  const axis: 'h' | 'v' =
    bridge.axis === 'h' || bridge.axis === 'v'
      ? bridge.axis
      : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
        ? 'h'
        : 'v'

  if (axis === 'h') {
    const y = bridge.y
    const sx = end.x >= start.x ? 1 : -1
    const beforeX = bridge.x - sx * r
    const afterX = bridge.x + sx * r
    const sweep: 0 | 1 = sx >= 0 ? 1 : 0
    return emit([
      { type: 'M', x: start.x, y },
      { type: 'L', x: beforeX, y },
      { type: 'A', r, sweep, x: afterX, y },
      { type: 'L', x: end.x, y },
    ])
  }

  const x = bridge.x
  const sy = end.y >= start.y ? 1 : -1
  const beforeY = bridge.y - sy * r
  const afterY = bridge.y + sy * r
  const sweep: 0 | 1 = sy >= 0 ? 0 : 1
  return emit([
    { type: 'M', x, y: start.y },
    { type: 'L', x, y: beforeY },
    { type: 'A', r, sweep, x, y: afterY },
    { type: 'L', x, y: end.y },
  ])
}

/** Highlight paths for all bridges on a route. */
export function bridgeHighlightPaths(
  points: Point[],
  bridges: BridgeJump[],
  pad = BRIDGE_HIGHLIGHT_PX,
): string[] {
  return bridges
    .map((br) => bridgeHighlightPath(points, br, pad))
    .filter((d) => d.length > 0)
}

/** Simple polyline path without bridges (fallback / hit testing). */
export function pointsToSimplePath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  return d
}
