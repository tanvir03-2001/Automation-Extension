import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  PORT_CLEARANCE_EXTRA,
  ROUTING_PADDING,
  type NodeBounds,
  type Point,
  type Rect,
} from '@/planner/routing/types'

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** Build padded obstacle rectangles from measured (or estimated) node bounds. */
export function buildObstacles(
  nodes: NodeBounds[],
  excludeIds: ReadonlySet<string> = new Set(),
  padding = ROUTING_PADDING,
): Rect[] {
  const obstacles: Rect[] = []
  for (const node of nodes) {
    if (excludeIds.has(node.id)) continue
    const w = node.width > 0 ? node.width : DEFAULT_NODE_WIDTH
    const h = node.height > 0 ? node.height : DEFAULT_NODE_HEIGHT
    obstacles.push({
      id: node.id,
      x: node.x - padding,
      y: node.y - padding,
      width: w + padding * 2,
      height: h + padding * 2,
    })
  }
  return obstacles
}

export function nodeToPaddedRect(node: NodeBounds, padding = ROUTING_PADDING): Rect {
  const w = node.width > 0 ? node.width : DEFAULT_NODE_WIDTH
  const h = node.height > 0 ? node.height : DEFAULT_NODE_HEIGHT
  return {
    id: node.id,
    x: node.x - padding,
    y: node.y - padding,
    width: w + padding * 2,
    height: h + padding * 2,
  }
}

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

export function expandRect(r: Rect, pad: number): Rect {
  return {
    id: r.id,
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }
}

/**
 * Push a handle point outward along `side` until it is just outside the padded rect.
 * Used so only a short port stub enters the obstacle; free-space routing starts outside.
 */
export function exitToClearance(
  point: Point,
  side: Side,
  obstacle: Rect,
  extra = PORT_CLEARANCE_EXTRA,
): Point {
  const rx2 = obstacle.x + obstacle.width
  const ry2 = obstacle.y + obstacle.height
  switch (side) {
    case 'right':
      return { x: Math.max(point.x, rx2 + extra), y: point.y }
    case 'left':
      return { x: Math.min(point.x, obstacle.x - extra), y: point.y }
    case 'top':
      return { x: point.x, y: Math.min(point.y, obstacle.y - extra) }
    case 'bottom':
      return { x: point.x, y: Math.max(point.y, ry2 + extra) }
  }
}

/** Axis-aligned segment vs rect intersection (open interior). */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  const minX = Math.min(ax, bx)
  const maxX = Math.max(ax, bx)
  const minY = Math.min(ay, by)
  const maxY = Math.max(ay, by)

  const rx2 = r.x + r.width
  const ry2 = r.y + r.height

  if (maxX < r.x || minX > rx2 || maxY < r.y || minY > ry2) return false

  if (Math.abs(ay - by) < 0.5) {
    if (ay <= r.y || ay >= ry2) return false
    return maxX > r.x && minX < rx2
  }

  if (Math.abs(ax - bx) < 0.5) {
    if (ax <= r.x || ax >= rx2) return false
    return maxY > r.y && minY < ry2
  }

  return true
}

export function rectsBoundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { id: 'bounds', x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
