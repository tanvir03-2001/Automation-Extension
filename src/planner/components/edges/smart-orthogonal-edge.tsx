import { useEffect, useMemo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  Position,
  useStore,
  type EdgeProps,
} from '@xyflow/react'
import { useEdgeRoute, useEdgeRouteContext } from '@/planner/components/edges/edge-route-context'
import { resolveNodeAccentColor } from '@/planner/components/flow-graph-shared'
import { pointsToSimplePath } from '@/planner/routing'

function toSide(pos: Position | undefined): 'left' | 'right' | 'top' | 'bottom' {
  switch (pos) {
    case Position.Left:
      return 'left'
    case Position.Top:
      return 'top'
    case Position.Bottom:
      return 'bottom'
    case Position.Right:
    default:
      return 'right'
  }
}

/**
 * Custom orthogonal edge that renders smart-routed paths from the shared route cache.
 * Stroke follows the source event's icon/accent color (no separate overlap palette).
 */
export function SmartOrthogonalEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  markerStart,
  interactionWidth = 28,
}: EdgeProps) {
  const { registerEndpoint, unregisterEndpoint } = useEdgeRouteContext()
  const route = useEdgeRoute(id)
  const sourceNode = useStore((s) => s.nodeLookup.get(source))
  const accent = resolveNodeAccentColor(sourceNode)

  useEffect(() => {
    registerEndpoint({
      id,
      source,
      target,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: toSide(sourcePosition),
      targetPosition: toSide(targetPosition),
    })
  }, [
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    registerEndpoint,
  ])

  useEffect(() => {
    return () => unregisterEndpoint(id)
  }, [id, unregisterEndpoint])

  const [fallbackPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  const path = useMemo(() => {
    if (route?.svgPath) return route.svgPath
    if (route?.points?.length) return pointsToSimplePath(route.points)
    return fallbackPath
  }, [route, fallbackPath])

  const startPt = route?.points?.[0] ?? { x: sourceX, y: sourceY }
  const endPt =
    route?.points && route.points.length > 0
      ? route.points[route.points.length - 1]
      : { x: targetX, y: targetY }

  // Prefer live source-node accent as soon as RF has the node (fixes first-open gray/teal).
  const stroke = sourceNode
    ? accent
    : typeof style?.stroke === 'string' && style.stroke.trim()
      ? style.stroke
      : accent
  const strokeWidth =
    typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2.5

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, stroke, strokeWidth }}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />

      <circle
        cx={startPt.x}
        cy={startPt.y}
        r={3.5}
        className="ae-edge-endpoint"
        fill={stroke}
        stroke="hsl(var(--card))"
        strokeWidth={1.25}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={endPt.x}
        cy={endPt.y}
        r={3.5}
        className="ae-edge-endpoint"
        fill={stroke}
        stroke="hsl(var(--card))"
        strokeWidth={1.25}
        style={{ pointerEvents: 'none' }}
      />
    </>
  )
}
