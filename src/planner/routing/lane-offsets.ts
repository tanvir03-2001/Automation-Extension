import { simplifyOrthogonal } from '@/planner/routing/grid-router'
import { MIN_LANE_GAP, type Point } from '@/planner/routing/types'

type Bundle = { ids: string[]; axis: 'h' | 'v'; key: number; segIndex: Map<string, number> }

function longestCorridorSegment(pts: Point[]): { index: number; axis: 'h' | 'v'; key: number; len: number } {
  let bestLen = 0
  let axis: 'h' | 'v' = 'h'
  let key = 0
  let index = 0
  // Prefer internal segments so port stubs stay fixed
  const start = pts.length > 3 ? 1 : 0
  const end = pts.length > 3 ? pts.length - 2 : pts.length - 1
  for (let i = start; i < end; i += 1) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    const len = dx + dy
    if (len < bestLen) continue
    bestLen = len
    if (dx >= dy) {
      axis = 'h'
      key = (a.y + b.y) / 2
      index = i
    } else {
      axis = 'v'
      key = (a.x + b.x) / 2
      index = i
    }
  }
  return { index, axis, key, len: bestLen }
}

/**
 * Offset only the shared corridor segment, then reconnect with orthogonal elbows.
 * Path endpoints stay exactly fixed.
 */
function offsetCorridorOnly(
  pts: Point[],
  segIndex: number,
  axis: 'h' | 'v',
  offset: number,
): Point[] {
  if (pts.length < 2 || Math.abs(offset) < 0.1) return pts.map((p) => ({ ...p }))
  const i = Math.max(0, Math.min(segIndex, pts.length - 2))
  const a = pts[i]
  const b = pts[i + 1]
  const a2 = axis === 'h' ? { x: a.x, y: a.y + offset } : { x: a.x + offset, y: a.y }
  const b2 = axis === 'h' ? { x: b.x, y: b.y + offset } : { x: b.x + offset, y: b.y }

  const head = pts.slice(0, i).map((p) => ({ ...p }))
  const tail = pts.slice(i + 2).map((p) => ({ ...p }))
  const out: Point[] = []

  const pushJoin = (from: Point, to: Point) => {
    if (out.length === 0) {
      out.push({ ...from })
    }
    const last = out[out.length - 1]
    if (Math.abs(last.x - to.x) < 0.5 && Math.abs(last.y - to.y) < 0.5) return
    if (Math.abs(last.x - to.x) > 0.5 && Math.abs(last.y - to.y) > 0.5) {
      // Prefer continuing the previous segment axis when possible
      if (out.length >= 2) {
        const prev = out[out.length - 2]
        if (Math.abs(prev.y - last.y) < 0.5) {
          out.push({ x: to.x, y: last.y })
        } else {
          out.push({ x: last.x, y: to.y })
        }
      } else {
        out.push({ x: to.x, y: last.y })
      }
    }
    const tip = out[out.length - 1]
    if (Math.abs(tip.x - to.x) > 0.5 || Math.abs(tip.y - to.y) > 0.5) {
      out.push({ ...to })
    }
  }

  if (head.length === 0) {
    out.push({ ...a2 })
  } else {
    for (const p of head) {
      if (out.length === 0) out.push(p)
      else pushJoin(out[out.length - 1], p)
    }
    pushJoin(out[out.length - 1], a2)
  }

  pushJoin(out[out.length - 1] ?? a2, b2)

  if (tail.length === 0) {
    // Corridor touched the end — restore exact last endpoint if needed
    const end = pts[pts.length - 1]
    pushJoin(out[out.length - 1], end)
  } else {
    for (const p of tail) {
      pushJoin(out[out.length - 1], p)
    }
    // Ensure exact original endpoint
    const end = pts[pts.length - 1]
    const last = out[out.length - 1]
    if (Math.abs(last.x - end.x) > 0.5 || Math.abs(last.y - end.y) > 0.5) {
      pushJoin(last, end)
    } else {
      out[out.length - 1] = { ...end }
    }
  }

  // Exact start
  if (out.length) out[0] = { ...pts[0] }

  return simplifyOrthogonal(out)
}

/**
 * Assign parallel offsets so edges that share similar corridors stay visually separated.
 * Only the shared corridor segment is shifted; endpoints stay fixed.
 */
export function assignLaneOffsets(
  routes: Map<string, Point[]>,
  gap = MIN_LANE_GAP,
): Map<string, Point[]> {
  const ids = [...routes.keys()].sort()
  if (ids.length <= 1) {
    return new Map(routes)
  }

  const bundles = new Map<string, Bundle>()
  const segIndexById = new Map<string, number>()

  for (const id of ids) {
    const pts = routes.get(id)
    if (!pts || pts.length < 2) continue

    const corridor = longestCorridorSegment(pts)
    segIndexById.set(id, corridor.index)
    const roundedKey = Math.round(corridor.key / gap) * gap
    const bk = `${corridor.axis}:${roundedKey}`
    const bundle = bundles.get(bk) ?? {
      ids: [] as string[],
      axis: corridor.axis,
      key: roundedKey,
      segIndex: new Map<string, number>(),
    }
    bundle.ids.push(id)
    bundle.segIndex.set(id, corridor.index)
    bundles.set(bk, bundle)
  }

  const result = new Map<string, Point[]>()
  for (const id of ids) {
    result.set(id, routes.get(id)!.map((p) => ({ ...p })))
  }

  for (const bundle of bundles.values()) {
    if (bundle.ids.length < 2) continue
    const n = bundle.ids.length
    for (let i = 0; i < n; i += 1) {
      const offset = (i - (n - 1) / 2) * gap
      if (Math.abs(offset) < 0.1) continue
      const id = bundle.ids[i]
      const pts = result.get(id)!
      const segIndex = bundle.segIndex.get(id) ?? segIndexById.get(id) ?? 0
      result.set(id, offsetCorridorOnly(pts, segIndex, bundle.axis, offset))
    }
  }

  return result
}

/** Soft-cost helper: penalize grid cells near already-routed polylines. */
export function buildOverlapSoftCost(
  existingRoutes: Iterable<Point[]>,
  cell: number,
): (gx: number, gy: number, worldX: number, worldY: number) => number {
  const occupied = new Set<string>()
  for (const pts of existingRoutes) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]
      const b = pts[i + 1]
      const steps = Math.max(
        1,
        Math.ceil((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / (cell * 0.5)),
      )
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps
        const x = a.x + (b.x - a.x) * t
        const y = a.y + (b.y - a.y) * t
        const gx = Math.round(x / cell)
        const gy = Math.round(y / cell)
        occupied.add(`${gx},${gy}`)
      }
    }
  }

  // Neighbor ring ≈ one MIN_LANE_GAP / cell so parallel runs prefer separate channels
  const ring = Math.max(1, Math.ceil(MIN_LANE_GAP / cell))

  return (_gx, _gy, worldX, worldY) => {
    const gx = Math.round(worldX / cell)
    const gy = Math.round(worldY / cell)
    if (occupied.has(`${gx},${gy}`)) return 6
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        if (dx === 0 && dy === 0) continue
        if (!occupied.has(`${gx + dx},${gy + dy}`)) continue
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist === 1) return 2.4
        if (dist <= ring) return 1.1
      }
    }
    return 0
  }
}
