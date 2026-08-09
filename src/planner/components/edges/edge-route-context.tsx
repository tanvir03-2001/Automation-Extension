import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useStore, type ReactFlowState } from '@xyflow/react'
import {
  computeDirtySet,
  computeRoutes,
  type ComputedRoute,
  type EdgeRouteInput,
  type NodeBounds,
} from '@/planner/routing'

type RouteContextValue = {
  getRoute: (edgeId: string) => ComputedRoute | undefined
  registerEndpoint: (input: EdgeRouteInput) => void
  unregisterEndpoint: (edgeId: string) => void
  version: number
  nodes: NodeBounds[]
  anyDragging: boolean
}

const EdgeRouteContext = createContext<RouteContextValue | null>(null)

function selectNodeBounds(state: ReactFlowState): NodeBounds[] {
  const nodes = [...state.nodeLookup.values()]
  return nodes.map((n) => ({
    id: n.id,
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    width: n.measured?.width ?? n.width ?? 220,
    height: n.measured?.height ?? n.height ?? 72,
    dragging: Boolean(n.dragging),
  }))
}

/**
 * Subscribes to React Flow node geometry and edge endpoint registrations.
 * Recomputes dirty routes on rAF while dragging; full pass when settled.
 */
export function EdgeRouteProvider({ children }: { children: ReactNode }) {
  const nodeBounds = useStore(selectNodeBounds)
  const anyDragging = useStore((s) => s.nodes.some((n) => n.dragging))

  const [version, setVersion] = useState(0)
  const routesRef = useRef<Map<string, ComputedRoute>>(new Map())
  const endpointsRef = useRef<Map<string, EdgeRouteInput>>(new Map())
  const prevNodesRef = useRef<NodeBounds[]>([])
  const prevEdgesRef = useRef<EdgeRouteInput[]>([])
  const rafRef = useRef<number | null>(null)
  const versionCounter = useRef(0)
  const wasDragging = useRef(false)

  const scheduleForceFull = useRef(false)

  const scheduleCompute = useCallback((forceFull: boolean) => {
    if (forceFull) scheduleForceFull.current = true
    if (rafRef.current != null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const force = scheduleForceFull.current
      scheduleForceFull.current = false

      const nodes = nodeBoundsRef.current
      const edges = [...endpointsRef.current.values()].sort((a, b) =>
        a.id.localeCompare(b.id),
      )
      const dragging = draggingRef.current

      const dirty = force
        ? null
        : computeDirtySet(
            prevNodesRef.current,
            nodes,
            prevEdgesRef.current,
            edges,
            dragging,
          )

      versionCounter.current += 1
      const result = computeRoutes(
        nodes,
        edges,
        routesRef.current,
        dirty,
        versionCounter.current,
      )
      routesRef.current = result.routes
      prevNodesRef.current = nodes
      prevEdgesRef.current = edges
      setVersion(result.version)
    })
  }, [])

  const nodeBoundsRef = useRef(nodeBounds)
  const draggingRef = useRef(anyDragging)
  nodeBoundsRef.current = nodeBounds
  draggingRef.current = anyDragging

  useEffect(() => {
    scheduleCompute(false)
  }, [nodeBounds, anyDragging, scheduleCompute])

  useEffect(() => {
    if (wasDragging.current && !anyDragging) {
      scheduleCompute(true)
    }
    wasDragging.current = anyDragging
  }, [anyDragging, scheduleCompute])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const registerEndpoint = useCallback(
    (input: EdgeRouteInput) => {
      const prev = endpointsRef.current.get(input.id)
      if (
        prev &&
        Math.abs(prev.sourceX - input.sourceX) < 0.5 &&
        Math.abs(prev.sourceY - input.sourceY) < 0.5 &&
        Math.abs(prev.targetX - input.targetX) < 0.5 &&
        Math.abs(prev.targetY - input.targetY) < 0.5 &&
        prev.source === input.source &&
        prev.target === input.target &&
        prev.sourcePosition === input.sourcePosition &&
        prev.targetPosition === input.targetPosition
      ) {
        return
      }
      endpointsRef.current.set(input.id, input)
      scheduleCompute(false)
    },
    [scheduleCompute],
  )

  const unregisterEndpoint = useCallback(
    (edgeId: string) => {
      if (!endpointsRef.current.has(edgeId)) return
      endpointsRef.current.delete(edgeId)
      routesRef.current.delete(edgeId)
      scheduleCompute(false)
    },
    [scheduleCompute],
  )

  const getRoute = useCallback(
    (edgeId: string) => routesRef.current.get(edgeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version invalidates cache reads
    [version],
  )

  const value = useMemo(
    () => ({
      getRoute,
      registerEndpoint,
      unregisterEndpoint,
      version,
      nodes: nodeBounds,
      anyDragging,
    }),
    [getRoute, registerEndpoint, unregisterEndpoint, version, nodeBounds, anyDragging],
  )

  return <EdgeRouteContext.Provider value={value}>{children}</EdgeRouteContext.Provider>
}

export function useEdgeRouteContext(): RouteContextValue {
  const ctx = useContext(EdgeRouteContext)
  if (!ctx) {
    return {
      getRoute: () => undefined,
      registerEndpoint: () => undefined,
      unregisterEndpoint: () => undefined,
      version: 0,
      nodes: [],
      anyDragging: false,
    }
  }
  return ctx
}

export function useEdgeRoute(edgeId: string): ComputedRoute | undefined {
  const { getRoute, version } = useEdgeRouteContext()
  return useMemo(() => getRoute(edgeId), [getRoute, edgeId, version])
}
