import { BRIDGE_RADIUS, type BridgeJump, type Point, type Segment } from '@/planner/routing/types'

function almostEqual(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) < eps
}

function segmentOrientation(s: Segment): 'h' | 'v' | 'd' {
  if (almostEqual(s.a.y, s.b.y)) return 'h'
  if (almostEqual(s.a.x, s.b.x)) return 'v'
  return 'd'
}

/** Intersection of one horizontal and one vertical segment (proper cross, not shared endpoint). */
export function hvIntersection(h: Segment, v: Segment): Point | null {
  if (segmentOrientation(h) !== 'h' || segmentOrientation(v) !== 'v') return null
  const y = h.a.y
  const x = v.a.x
  const hMin = Math.min(h.a.x, h.b.x)
  const hMax = Math.max(h.a.x, h.b.x)
  const vMin = Math.min(v.a.y, v.b.y)
  const vMax = Math.max(v.a.y, v.b.y)
  // Require interior cross (not T-junction at endpoint)
  if (x <= hMin + 1 || x >= hMax - 1) return null
  if (y <= vMin + 1 || y >= vMax - 1) return null
  return { x, y }
}

function polylineSegments(points: Point[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    segs.push({ a: points[i], b: points[i + 1] })
  }
  return segs
}

function distanceAlong(points: Point[], x: number, y: number): number {
  let acc = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    const onH = almostEqual(a.y, b.y) && almostEqual(a.y, y)
    const onV = almostEqual(a.x, b.x) && almostEqual(a.x, x)
    if (onH) {
      const minX = Math.min(a.x, b.x)
      const maxX = Math.max(a.x, b.x)
      if (x >= minX - 0.5 && x <= maxX + 0.5) {
        return acc + Math.abs(x - a.x)
      }
    } else if (onV) {
      const minY = Math.min(a.y, b.y)
      const maxY = Math.max(a.y, b.y)
      if (y >= minY - 0.5 && y <= maxY + 0.5) {
        return acc + Math.abs(y - a.y)
      }
    }
    acc += len
  }
  return acc
}

/**
 * Detect crossings between routes. Later edges in `orderedIds` get bridge jumps
 * (they visually pass "over" earlier edges).
 */
export function detectCrossings(
  routes: Map<string, Point[]>,
  orderedIds: string[],
): Map<string, BridgeJump[]> {
  const bridges = new Map<string, BridgeJump[]>()
  for (const id of orderedIds) bridges.set(id, [])

  for (let i = 0; i < orderedIds.length; i += 1) {
    for (let j = i + 1; j < orderedIds.length; j += 1) {
      const idA = orderedIds[i]
      const idB = orderedIds[j]
      const ptsA = routes.get(idA)
      const ptsB = routes.get(idB)
      if (!ptsA || !ptsB) continue

      const segsA = polylineSegments(ptsA)
      const segsB = polylineSegments(ptsB)

      for (const sa of segsA) {
        for (const sb of segsB) {
          const oa = segmentOrientation(sa)
          const ob = segmentOrientation(sb)
          if (oa === 'd' || ob === 'd' || oa === ob) continue

          const h = oa === 'h' ? sa : sb
          const v = oa === 'v' ? sa : sb
          const hit = hvIntersection(h, v)
          if (!hit) continue

          // Skip if near shared node endpoints of either path
          const nearEnd = (pts: Point[]) => {
            const s = pts[0]
            const e = pts[pts.length - 1]
            return (
              (Math.abs(s.x - hit.x) < BRIDGE_RADIUS * 2 &&
                Math.abs(s.y - hit.y) < BRIDGE_RADIUS * 2) ||
              (Math.abs(e.x - hit.x) < BRIDGE_RADIUS * 2 &&
                Math.abs(e.y - hit.y) < BRIDGE_RADIUS * 2)
            )
          }
          if (nearEnd(ptsA) || nearEnd(ptsB)) continue

          // Upper edge (later in order) gets the bridge
          const upperId = idB
          const upperPts = ptsB
          const axis = segmentOrientation(
            polylineSegments(upperPts).find((s) => {
              const o = segmentOrientation(s)
              if (o === 'h') {
                return (
                  almostEqual(s.a.y, hit.y) &&
                  hit.x > Math.min(s.a.x, s.b.x) &&
                  hit.x < Math.max(s.a.x, s.b.x)
                )
              }
              if (o === 'v') {
                return (
                  almostEqual(s.a.x, hit.x) &&
                  hit.y > Math.min(s.a.y, s.b.y) &&
                  hit.y < Math.max(s.a.y, s.b.y)
                )
              }
              return false
            }) ?? { a: hit, b: hit },
          )

          const list = bridges.get(upperId) ?? []
          list.push({
            at: distanceAlong(upperPts, hit.x, hit.y),
            x: hit.x,
            y: hit.y,
            axis: axis === 'v' ? 'v' : 'h',
          })
          bridges.set(upperId, list)
        }
      }
    }
  }

  // Deduplicate bridges that are too close
  for (const [id, list] of bridges) {
    list.sort((a, b) => a.at - b.at)
    const deduped: BridgeJump[] = []
    for (const b of list) {
      const prev = deduped[deduped.length - 1]
      if (prev && Math.hypot(prev.x - b.x, prev.y - b.y) < BRIDGE_RADIUS * 2) continue
      deduped.push(b)
    }
    bridges.set(id, deduped)
  }

  return bridges
}
