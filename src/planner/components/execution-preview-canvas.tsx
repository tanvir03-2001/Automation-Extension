import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type MiniMapNodeProps,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loader2 } from 'lucide-react'
import {
  applyRunEdgeStyles,
  defaultPlannerEdgeOptions,
  plannerNodeTypes,
  toFlowEdges,
  toFlowNodes,
} from '@/planner/components/flow-graph-shared'
import { RunVisualWorkflowProvider } from '@/planner/hooks/run-visual-workflow-context'
import { useActiveRunLabel } from '@/planner/hooks/use-node-run-visual'
import { usePlannerStore } from '@/planner/store/planner-store'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'
import type { ExecutionCheckpoint, VisualWorkflow } from '@/planner/types/plan'

function resolveFocusNodeId(checkpoint: ExecutionCheckpoint): string | null {
  if (checkpoint.currentNodeId) return checkpoint.currentNodeId
  if (checkpoint.previousNodeId) return checkpoint.previousNodeId
  for (let i = checkpoint.history.length - 1; i >= 0; i -= 1) {
    if (checkpoint.history[i]?.nodeId) return checkpoint.history[i].nodeId
  }
  return null
}

/** Small dots so event positions are clear on the compact minimap. */
function PreviewMiniMapDot({ x, y, width, height, color, strokeColor }: MiniMapNodeProps) {
  const r = 2.4
  return (
    <circle
      cx={x + width / 2}
      cy={y + height / 2}
      r={r}
      fill={color ?? '#0f766e'}
      stroke={strokeColor ?? '#0f766e'}
      strokeWidth={0.6}
    />
  )
}

function PreviewInner({ workflowId }: { workflowId: string | null }) {
  const t = useT()
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const runHud = useActiveRunLabel()
  const { setCenter, fitView, getZoom } = useReactFlow()

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const loadedWorkflowId = useRef<string | null>(null)
  const lastCenteredNodeId = useRef<string | null>(null)
  const lastCenteredStatus = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const workflowRef = useRef<VisualWorkflow | undefined>(workflow)
  workflowRef.current = workflow

  const centerOnNode = useCallback(
    (nodeId: string, duration = 500) => {
      const graph = workflowRef.current
      const node = graph?.nodes.find((item) => item.id === nodeId)
      if (!node) return
      lastCenteredNodeId.current = nodeId
      const zoom = Math.max(0.85, Math.min(getZoom(), 1.25))
      void setCenter(node.position.x + 110, node.position.y + 48, {
        zoom,
        duration,
      })
    },
    [getZoom, setCenter],
  )

  useEffect(() => {
    if (!workflowId || !workflow) {
      setNodes([])
      setEdges([])
      loadedWorkflowId.current = null
      lastCenteredNodeId.current = null
      return
    }

    const nextNodes = toFlowNodes(workflow.nodes).map((node) => ({
      ...node,
      draggable: false,
      connectable: false,
      selectable: false,
      selected: false,
    }))
    const nextEdges = applyRunEdgeStyles(toFlowEdges(workflow.edges), {
      workflowId,
      checkpoint: usePlannerStore.getState().checkpoint,
      selectedEdgeId: null,
    }).map((edge) => ({
      ...edge,
      selectable: false,
      focusable: false,
      reconnectable: false,
      selected: false,
    }))

    setNodes(nextNodes)
    setEdges(nextEdges)

    const workflowChanged = loadedWorkflowId.current !== workflowId
    loadedWorkflowId.current = workflowId
    if (workflowChanged) {
      lastCenteredNodeId.current = null
      window.requestAnimationFrame(() => {
        void fitView({ padding: 0.22, duration: 400 })
      })
    }
  }, [workflowId, workflow, fitView])

  useEffect(() => {
    setEdges((current) => {
      const next = applyRunEdgeStyles(current, {
        workflowId,
        checkpoint,
        selectedEdgeId: null,
      }).map((edge) => ({
        ...edge,
        selectable: false,
        focusable: false,
        reconnectable: false,
        selected: false,
      }))
      const same =
        current.length === next.length &&
        current.every((edge, index) => {
          const other = next[index]
          return (
            edge.id === other?.id &&
            edge.style?.stroke === other?.style?.stroke &&
            edge.animated === other?.animated
          )
        })
      return same ? current : next
    })
  }, [
    checkpoint,
    checkpoint?.currentNodeId,
    checkpoint?.previousNodeId,
    checkpoint?.status,
    checkpoint?.history.length,
    workflowId,
  ])

  // Center on the active (or last active) event - including after stop/complete.
  useEffect(() => {
    if (!workflowId || !workflow || !checkpoint) return
    if (checkpoint.workflowId !== workflowId) return

    const live =
      checkpoint.status === 'running' ||
      checkpoint.status === 'paused' ||
      checkpoint.status === 'waiting'
    const terminal =
      checkpoint.status === 'completed' ||
      checkpoint.status === 'failed' ||
      checkpoint.status === 'cancelled'
    if (!live && !terminal) return

    const focusId = resolveFocusNodeId(checkpoint)
    if (!focusId) return

    const statusChanged = lastCenteredStatus.current !== checkpoint.status
    const nodeChanged = lastCenteredNodeId.current !== focusId
    if (!nodeChanged && !statusChanged) return

    lastCenteredStatus.current = checkpoint.status
    centerOnNode(focusId, live ? 650 : 500)

    // Layout expands after stop (~700ms) - re-center so the last event stays mid-screen.
    if (terminal) {
      const t1 = window.setTimeout(() => centerOnNode(focusId, 420), 380)
      const t2 = window.setTimeout(() => centerOnNode(focusId, 380), 780)
      return () => {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
      }
    }
  }, [
    checkpoint?.currentNodeId,
    checkpoint?.previousNodeId,
    checkpoint?.status,
    checkpoint?.workflowId,
    checkpoint?.history.length,
    workflow,
    workflowId,
    centerOnNode,
  ])

  // Keep last focused event centered when the panel size changes (expand/shrink).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let timer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const ck = usePlannerStore.getState().checkpoint
        if (!ck || ck.workflowId !== workflowId) return
        const focusId = lastCenteredNodeId.current ?? resolveFocusNodeId(ck)
        if (focusId) centerOnNode(focusId, 360)
      }, 140)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [workflowId, centerOnNode])

  if (!workflowId || !workflow) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
        {t('preview.empty')}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="ae-canvas ae-preview-canvas relative h-full min-h-0 overflow-hidden rounded-xl border border-border bg-[hsl(var(--background))]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        {runHud.active && runHud.status ? (
          <div
            className={cn(
              'flex max-w-[min(520px,94%)] items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] shadow-lg backdrop-blur',
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
                  {t('preview.now')} <span className="font-semibold">{runHud.label}</span>
                </span>
              </>
            ) : (
              <span className="opacity-70">{t('preview.watch')}</span>
            )}
          </div>
        ) : (
          <div className="rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
            {t('preview.readOnly')}
          </div>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={plannerNodeTypes}
        defaultEdgeOptions={defaultPlannerEdgeOptions}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        selectNodesOnDrag={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        fitView
        fitViewOptions={{ padding: 0.22 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={1.75}
      >
        <Background id="preview-dots" variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#c5ceda" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeComponent={PreviewMiniMapDot}
          nodeColor={() => '#0f766e'}
          nodeStrokeColor={() => '#0f766e'}
          maskColor="rgba(15, 23, 42, 0.1)"
          maskStrokeColor="#0f766e"
          maskStrokeWidth={1.25}
          offsetScale={8}
          ariaLabel="Live execution mini map"
          className="ae-preview-minimap !m-2 !overflow-hidden !rounded-xl !border !border-[hsl(var(--border))] !bg-[hsl(var(--card))] !shadow-md"
        />
        <Controls
          showInteractive={false}
          className="!m-2 !overflow-hidden !rounded-xl !border !border-[hsl(var(--border))] !bg-[hsl(var(--card))] !shadow-md"
        />
      </ReactFlow>
    </div>
  )
}

export function ExecutionPreviewCanvas({ workflowId }: { workflowId: string | null }) {
  return (
    <RunVisualWorkflowProvider workflowId={workflowId}>
      <ReactFlowProvider>
        <PreviewInner workflowId={workflowId} />
      </ReactFlowProvider>
    </RunVisualWorkflowProvider>
  )
}
