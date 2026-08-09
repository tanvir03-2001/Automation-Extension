export type Point = { x: number; y: number }

export type Rect = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Segment = {
  a: Point
  b: Point
}

export type BridgeJump = {
  /** Parametric distance along the polyline (0..totalLength) */
  at: number
  x: number
  y: number
  /** Direction of the bridge arc: 'h' = horizontal segment crossed vertically */
  axis: 'h' | 'v'
}

export type EdgeRouteInput = {
  id: string
  source: string
  target: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition?: 'left' | 'right' | 'top' | 'bottom'
  targetPosition?: 'left' | 'right' | 'top' | 'bottom'
}

export type ComputedRoute = {
  edgeId: string
  points: Point[]
  bridges: BridgeJump[]
  svgPath: string
  /** Overlay paths around each bridge (at ± BRIDGE_HIGHLIGHT_PX); stroke uses route accent. */
  highlightPaths: string[]
}

export type NodeBounds = {
  id: string
  x: number
  y: number
  width: number
  height: number
  dragging?: boolean
}

export const ROUTING_PADDING = 32
export const GRID_CELL = 18
export const MIN_LANE_GAP = 9
export const BRIDGE_RADIUS = 6
export const BRIDGE_HIGHLIGHT_PX = 30
export const CORNER_RADIUS = 6
export const DEFAULT_NODE_WIDTH = 220
export const DEFAULT_NODE_HEIGHT = 72
export const PORT_CLEARANCE_EXTRA = 4
