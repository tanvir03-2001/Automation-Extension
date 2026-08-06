import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Layers, Loader2, Trash2 } from 'lucide-react'
import { ActionFlowNode } from '@/planner/components/action-node'
import {
  latestHistoryStatusMap,
  useActiveRunLabel,
} from '@/planner/hooks/use-node-run-visual'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/cn'
import type { ExecutionCheckpoint, PlannerEdge, PlannerNode } from '@/planner/types/plan'

const nodeTypes = { action: ActionFlowNode, start: ActionFlowNode, end: ActionFlowNode }

const defaultEdgeOptions: Partial<Edge> = {
  type: 'smoothstep',
  animated: true,
  selectable: true,
  focusable: true,
  reconnectable: true,
  interactionWidth: 28,
  style: { stroke: '#94a3b8', strokeWidth: 2.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: '#94a3b8',
  },
}

function toFlowNodes(nodes: PlannerNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }))
}

function toFlowEdges(edges: PlannerEdge[]): Edge[] {
  // Deduplicate identical connections (fixes messy double lines)
  const seen = new Set<string>()
  const unique: PlannerEdge[] = []
  for (const edge of edges) {
    const key = `${edge.source}|${edge.sourceHandle ?? 'out'}|${edge.target}|${edge.targetHandle ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(edge)
  }

  return unique.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? 'out',
    targetHandle: edge.targetHandle ?? undefined,
    ...defaultEdgeOptions,
    label: edge.label,
    selected: false,
  }))
}

function fromFlow(nodes: Node[], edges: Edge[]): { nodes: PlannerNode[]; edges: PlannerEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type as PlannerNode['type']) ?? 'action',
      position: node.position,
      data: node.data as PlannerNode['data'],
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      animated: edge.animated,
    })),
  }
}

function applyRunEdgeStyles(
  edges: Edge[],
  args: {
    workflowId: string | null
    checkpoint: ExecutionCheckpoint | null
    selectedEdgeId: string | null
  },
): Edge[] {
  const { workflowId, checkpoint, selectedEdgeId } = args
  const live =
    Boolean(checkpoint) &&
    Boolean(workflowId) &&
    checkpoint!.workflowId === workflowId &&
    (checkpoint!.status === 'running' ||
      checkpoint!.status === 'paused' ||
      checkpoint!.status === 'waiting' ||
      checkpoint!.status === 'failed' ||
      checkpoint!.status === 'completed')

  const historyMap = latestHistoryStatusMap(live ? checkpoint : null)
  const currentId = live ? checkpoint?.currentNodeId : null
  const previousId = live ? checkpoint?.previousNodeId : null

  return edges.map((edge) => {
    const selected = selectedEdgeId ? edge.id === selectedEdgeId : Boolean(edge.selected)
    if (selected) {
      return {
        ...edge,
        selected: true,
        animated: false,
        className: 'ae-edge-selected',
        style: { stroke: '#0f766e', strokeWidth: 3.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#0f766e',
        },
      }
    }

    const intoCurrent = Boolean(currentId && edge.target === currentId)
    const fromPrevious = Boolean(
      previousId && currentId && edge.source === previousId && edge.target === currentId,
    )
    const sourceDone = ['success', 'skipped'].includes(historyMap.get(edge.source) ?? '')
    const targetDone = ['success', 'skipped'].includes(historyMap.get(edge.target) ?? '')
    const traversed = sourceDone && (targetDone || intoCurrent)

    if (intoCurrent || fromPrevious) {
      return {
        ...edge,
        selected: false,
        animated: true,
        className: 'ae-edge-active',
        style: { stroke: '#10b981', strokeWidth: 3.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#10b981',
        },
      }
    }

    if (traversed) {
      return {
        ...edge,
        selected: false,
        animated: false,
        className: 'ae-edge-done',
        style: { stroke: '#34d399', strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: '#34d399',
        },
      }
    }

    return {
      ...edge,
      ...defaultEdgeOptions,
      selected: false,
      className: undefined,
      label: edge.label,
    }
  })
}

function CanvasInner() {
  const workflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const graphRevision = usePlannerStore((s) => s.graphRevision)
  const updateWorkflowGraph = usePlannerStore((s) => s.updateWorkflowGraph)
  const addActionNode = usePlannerStore((s) => s.addActionNode)
  const selectNode = usePlannerStore((s) => s.selectNode)
  const selectedNodeId = usePlannerStore((s) => s.selectedNodeId)
  const setDocsActionId = usePlannerStore((s) => s.setDocsActionId)
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const runHud = useActiveRunLabel()
  const { screenToFlowPosition } = useReactFlow()

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const loadedWorkflowId = useRef<string | null>(null)
  const loadedRevision = useRef(-1)
  const saveTimer = useRef<number | null>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const flushSave = useCallback(() => {
    if (!workflowId) return
    const graph = fromFlow(nodesRef.current, edgesRef.current)
    updateWorkflowGraph(workflowId, graph.nodes, graph.edges)
  }, [updateWorkflowGraph, workflowId])

  const scheduleSave = useCallback(() => {
    if (!workflowId) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => flushSave(), 120)
  }, [flushSave, workflowId])

  useEffect(() => {
    if (!workflowId || !workflow) {
      setNodes([])
      setEdges([])
      loadedWorkflowId.current = null
      return
    }

    const workflowChanged = loadedWorkflowId.current !== workflowId
    const revisionChanged = loadedRevision.current !== graphRevision
    if (!workflowChanged && !revisionChanged) return

    const localPos = new Map(nodesRef.current.map((n) => [n.id, n.position]))
    const keepLocalPositions = !workflowChanged

    const keepSelectedId = usePlannerStore.getState().selectedNodeId
    setNodes(
      toFlowNodes(
        workflow.nodes.map((node) =>
          keepLocalPositions && localPos.has(node.id)
            ? { ...node, position: localPos.get(node.id)! }
            : node,
        ),
      ).map((node) => ({
        ...node,
        selected: node.id === keepSelectedId,
      })),
    )
    setEdges(
      applyRunEdgeStyles(toFlowEdges(workflow.edges), {
        workflowId,
        checkpoint: usePlannerStore.getState().checkpoint,
        selectedEdgeId: keepLocalPositions ? selectedEdgeId : null,
      }),
    )
    loadedWorkflowId.current = workflowId
    loadedRevision.current = graphRevision
    if (workflowChanged) setSelectedEdgeId(null)
    // Never auto fitView on drop/edit — keeps nodes where you placed them
  }, [workflow, workflowId, graphRevision])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!workflow) return
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const storeNode = workflow.nodes.find((item) => item.id === node.id)
        const shouldSelect = node.id === selectedNodeId
        if (!storeNode) return node
        if (storeNode.data === node.data && node.selected === shouldSelect) return node
        changed = true
        return {
          ...node,
          data: storeNode.data,
          selected: shouldSelect,
        }
      })
      if (changed) nodesRef.current = next
      return changed ? next : current
    })
  }, [workflow, selectedNodeId])

  useEffect(() => {
    setEdges((current) => {
      const next = applyRunEdgeStyles(current, {
        workflowId,
        checkpoint,
        selectedEdgeId,
      })
      edgesRef.current = next
      return next
    })
  }, [
    checkpoint,
    checkpoint?.currentNodeId,
    checkpoint?.previousNodeId,
    checkpoint?.status,
    checkpoint?.updatedAt,
    checkpoint?.workflowId,
    selectedEdgeId,
    workflowId,
  ])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)
        nodesRef.current = next
        return next
      })
      if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) {
        scheduleSave()
      }
    },
    [scheduleSave],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const selected = changes.find(
        (change): change is EdgeChange & { type: 'select'; selected: boolean; id: string } =>
          change.type === 'select' && 'selected' in change,
      )
      let nextSelected = selectedEdgeId
      if (selected?.selected) nextSelected = selected.id
      if (selected && !selected.selected && selectedEdgeId === selected.id) {
        nextSelected = null
      }
      if (changes.some((change) => change.type === 'remove')) {
        nextSelected = null
      }
      if (nextSelected !== selectedEdgeId) setSelectedEdgeId(nextSelected)

      setEdges((current) => {
        const changed = applyEdgeChanges(changes, current)
        const next = applyRunEdgeStyles(changed, {
          workflowId,
          checkpoint: usePlannerStore.getState().checkpoint,
          selectedEdgeId: nextSelected,
        })
        edgesRef.current = next
        return next
      })

      if (changes.some((change) => change.type === 'remove')) {
        scheduleSave()
      }
    },
    [scheduleSave, selectedEdgeId, workflowId],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return

      setEdges((current) => {
        const duplicate = current.some(
          (edge) =>
            edge.source === connection.source &&
            edge.target === connection.target &&
            (edge.sourceHandle ?? 'out') === (connection.sourceHandle ?? 'out'),
        )
        if (duplicate) return current

        const next = addEdge(
          {
            ...connection,
            id: `e_${connection.source}_${connection.target}_${Date.now()}`,
            sourceHandle: connection.sourceHandle ?? 'out',
            ...defaultEdgeOptions,
          },
          current,
        )
        edgesRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((current) => {
        const next = reconnectEdge(oldEdge, newConnection, current).map((edge) => ({
          ...edge,
          ...defaultEdgeOptions,
          sourceHandle: edge.sourceHandle ?? 'out',
        }))
        edgesRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return
    setEdges((current) => {
      const next = current.filter((edge) => edge.id !== selectedEdgeId)
      edgesRef.current = next
      return next
    })
    setSelectedEdgeId(null)
    scheduleSave()
  }, [scheduleSave, selectedEdgeId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!selectedEdgeId) return
      event.preventDefault()
      deleteSelectedEdge()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelectedEdge, selectedEdgeId])

  if (!workflow || !workflowId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Layers className="h-8 w-8 opacity-40" />
        Select or create a plan to open the visual builder.
      </div>
    )
  }

  return (
    <div
      className="ae-canvas relative h-full min-h-[520px] flex-1"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const actionId = event.dataTransfer.getData('application/planner-action')
        if (!actionId) return

        // Exact drop position on the board (accounts for pan/zoom)
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })

        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        flushSave()

        const newId = addActionNode(workflowId, actionId, {
          x: position.x - 110,
          y: position.y - 36,
        })
        const created = usePlannerStore
          .getState()
          .workflows.find((wf) => wf.id === workflowId)
          ?.nodes.find((node) => node.id === newId)

        if (created) {
          setNodes((current) => {
            const next = [
              ...current.map((node) => ({ ...node, selected: false })),
              { ...toFlowNodes([created])[0], selected: true },
            ]
            nodesRef.current = next
            return next
          })
          loadedRevision.current = usePlannerStore.getState().graphRevision
          selectNode(newId)
          setSelectedEdgeId(null)
        }
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        {runHud.active && runHud.status ? (
          <div
            className={cn(
              'flex max-w-[min(560px,92%)] items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur',
              runHud.status === 'failed'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                : runHud.status === 'completed'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : runHud.status === 'paused' || runHud.status === 'waiting'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-100'
                    : 'border-emerald-500/40 bg-card/95 text-foreground',
            )}
          >
            {runHud.status === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-500" />
            ) : null}
            <span className="font-semibold capitalize">{runHud.status}</span>
            {runHud.label ? (
              <>
                <span className="opacity-60">·</span>
                <span className="truncate">
                  Now: <span className="font-semibold">{runHud.label}</span>
                </span>
              </>
            ) : (
              <span className="opacity-70">
                {runHud.status === 'completed' ? 'All steps finished' : 'Watch the glowing step'}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-full border border-border bg-card px-4 py-2 text-xs text-foreground shadow-sm backdrop-blur">
            Correct flow: <span className="font-semibold">Start → Open URL → End</span>
            {' · '}
            Click a line to select · Delete to remove
          </div>
        )}
      </div>

      {selectedEdgeId ? (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-lg">
          <p className="text-xs text-foreground">Connection selected</p>
          <Button size="sm" variant="destructive" className="rounded-xl" onClick={deleteSelectedEdge}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete line
          </Button>
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={() => flushSave()}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
          // Checkpoint edge re-styles often fire an empty selection — do NOT clear the drawer.
          if (selectedNodes[0]) {
            setSelectedEdgeId(null)
            selectNode(selectedNodes[0].id)
            setDocsActionId(null)
            return
          }
          if (selectedEdges[0]) {
            setSelectedEdgeId(selectedEdges[0].id)
            selectNode(null)
          }
        }}
        onPaneClick={() => {
          selectNode(null)
          setSelectedEdgeId(null)
        }}
        onNodeClick={(_event, node) => {
          setSelectedEdgeId(null)
          selectNode(node.id)
          setDocsActionId(null)
        }}
        edgesFocusable
        edgesReconnectable
        elementsSelectable
        selectNodesOnDrag={false}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag={false}
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#c5ceda" />
        <MiniMap
          pannable
          zoomable
          className="!overflow-hidden !rounded-2xl !border !border-[hsl(var(--border))] !bg-[hsl(var(--card))] !shadow-lg"
          maskColor="rgba(15, 23, 42, 0.08)"
          nodeColor={() => '#0f766e'}
        />
        <Controls className="!overflow-hidden !rounded-2xl !border !border-[hsl(var(--border))] !bg-[hsl(var(--card))] !shadow-lg" />
      </ReactFlow>
    </div>
  )
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
