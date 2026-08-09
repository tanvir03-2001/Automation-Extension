import { MIN_LANE_GAP, type Point } from '@/planner/routing/types'

/**
 * Assign parallel offsets so edges that share similar corridors stay visually separated.
 * Offsets are applied perpendicular to dominant segment direction.
 */
export function assignLaneOffsets(
  routes: Map<string, Point[]>,
  gap = MIN_LANE_GAP,
): Map<string, Point[]> {
  const ids = [...routes.keys()].sort()
  if (ids.length <= 1) {
    return new Map(routes)
  }

  // Group by rounded horizontal or vertical mid-corridor keys
  type Bundle = { ids: string[]; axis: 'h' | 'v'; key: number }
  const bundles = new Map<string, Bundle>()

  for (const id of ids) {
    const pts = routes.get(id)
    if (!pts || pts.length < 2) continue

    // Prefer the longest internal segment as corridor signature
    let bestLen = 0
    let axis: 'h' | 'v' = 'h'
    let key = 0
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      const len = dx + dy
      if (len < bestLen) continue
      bestLen = len
      if (dx >= dy) {
        axis = 'h'
        key = Math.round(((a.y + b.y) / 2) / gap) * gap
      } else {
        axis = 'v'
        key = Math.round(((a.x + b.x) / 2) / gap) * gap
      }
    }

    const bk = `${axis}:${key}`
    const bundle = bundles.get(bk) ?? { ids: [], axis, key }
    bundle.ids.push(id)
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
      result.set(
        id,
        pts.map((p, idx) => {
          // Keep exact endpoints; offset middle waypoints only
          if (idx === 0 || idx === pts.length - 1) return p
          if (bundle.axis === 'h') return { x: p.x, y: p.y + offset }
          return { x: p.x + offset, y: p.y }
        }),
      )
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

  return (_gx, _gy, worldX, worldY) => {
    const gx = Math.round(worldX / cell)
    const gy = Math.round(worldY / cell)
    if (occupied.has(`${gx},${gy}`)) return 4
    if (
      occupied.has(`${gx + 1},${gy}`) ||
      occupied.has(`${gx - 1},${gy}`) ||
      occupied.has(`${gx},${gy + 1}`) ||
      occupied.has(`${gx},${gy - 1}`)
    ) {
      return 1.2
    }
    return 0
  }
}
