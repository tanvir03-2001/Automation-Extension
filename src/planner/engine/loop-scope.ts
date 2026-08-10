import { resolveActionAlias } from '@/planner/engine/action-aliases'
import { resolveJsonPathToArray } from '@/planner/engine/custom-section-paths'
import { extractTextItems, parseDatasetSourceId } from '@/planner/engine/dataset-utils'
import type { AutomationPlan, PlannerNode, VisualWorkflow } from '@/planner/types/plan'

const LOOP_ACTION_IDS = new Set([
  'loops.map',
  'loops.foreach',
  'loops.for',
])

export type LoopScopeFrame = {
  loopNodeId: string
  actionId: string
  label: string
  itemVariable: string
  indexVariable: string
  sampleItem?: unknown
  /** Human-readable collection binding, e.g. `story title → items`. */
  collectionLabel: string
}

export type LoopScope =
  | { kind: 'outside' }
  | { kind: 'completed'; loopNodeId: string; actionId: string; label: string }
  | { kind: 'body'; stack: LoopScopeFrame[] }

function isLoopActionId(actionId: string): boolean {
  const resolved = resolveActionAlias(actionId).actionId
  return LOOP_ACTION_IDS.has(actionId) || LOOP_ACTION_IDS.has(resolved)
}

function outgoingTargets(
  workflow: VisualWorkflow,
  nodeId: string,
  handle: string,
): string[] {
  return workflow.edges
    .filter((edge) => edge.source === nodeId && edge.sourceHandle === handle)
    .map((edge) => edge.target)
}

/** BFS from start nodes; stop expanding when landing back on stopIds. */
function collectReachable(
  workflow: VisualWorkflow,
  starts: string[],
  options: { stopAt?: Set<string>; blockSourceHandles?: Map<string, Set<string>> },
): Set<string> {
  const visited = new Set<string>()
  const queue = [...starts]
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    if (options.stopAt?.has(id)) continue
    visited.add(id)
    const blocked = options.blockSourceHandles?.get(id)
    for (const edge of workflow.edges) {
      if (edge.source !== id) continue
      if (blocked && edge.sourceHandle && blocked.has(edge.sourceHandle)) continue
      if (!visited.has(edge.target) && !options.stopAt?.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }
  return visited
}

function sampleItemFromLoopParams(
  loopNode: PlannerNode,
  plan: AutomationPlan | null | undefined,
): unknown {
  const params = loopNode.data.params
  const actionId = resolveActionAlias(loopNode.data.actionId).actionId

  if (actionId === 'loops.for') {
    return 0
  }

  const sourceId = String(params.collectionSource ?? '').trim()
  const ref = String(params.collectionRef ?? '').trim()
  const nestPath = String(params.collectionPath ?? '').trim()

  const datasetId = parseDatasetSourceId(sourceId)
  if (datasetId && plan) {
    const dataset = plan.datasets.find((ds) => ds.id === datasetId || ds.name === datasetId)
    if (!dataset) return undefined
    if (dataset.kind === 'textLibrary' && (ref === 'items' || ref === '$' || !ref)) {
      const items = extractTextItems(dataset.data)
      if (items[0]) {
        return { title: items[0].title, text: items[0].text, id: items[0].id }
      }
    }
    const path = nestPath && nestPath !== '$' ? nestPath : ref || '$'
    const items = resolveJsonPathToArray(dataset.data, path)
    return items[0]
  }

  // textLibrary source
  if (sourceId === 'textLibrary' && plan) {
    const lib = plan.textLibraries.find((item) => item.id === ref || item.name === ref)
    if (lib?.items[0]) {
      return { title: lib.items[0].title, text: lib.items[0].text, id: lib.items[0].id }
    }
  }

  return undefined
}

/** Same sentinel as map-array-sources COPY_STORE_ALL_REF. */
const COPY_STORE_ALL_REF_LOCAL = '__all__'

function collectionLabelFromLoopParams(
  loopNode: PlannerNode,
  plan: AutomationPlan | null | undefined,
): string {
  const params = loopNode.data.params
  const actionId = resolveActionAlias(loopNode.data.actionId).actionId

  if (actionId === 'loops.for') {
    const count = Number(params.count ?? 3)
    return `For 0..${Number.isFinite(count) && count > 0 ? count - 1 : 'N'}`
  }

  const sourceId = String(params.collectionSource ?? '').trim()
  const ref = String(params.collectionRef ?? '').trim()
  const nestPath = String(params.collectionPath ?? '').trim()

  const datasetId = parseDatasetSourceId(sourceId)
  if (datasetId && plan) {
    const dataset = plan.datasets.find((ds) => ds.id === datasetId || ds.name === datasetId)
    const name = dataset?.name ?? datasetId
    const path =
      nestPath && nestPath !== '$'
        ? nestPath
        : ref && ref !== '$'
          ? ref
          : dataset?.kind === 'textLibrary'
            ? 'items'
            : ''
    return path ? `${name} → ${path}` : name
  }

  if (sourceId === 'textLibrary' && plan) {
    const lib = plan.textLibraries.find((item) => item.id === ref || item.name === ref)
    const name = lib?.name || ref || 'Text library'
    return `${name} → items`
  }

  if (sourceId === 'copyStore') {
    const path = nestPath && nestPath !== '$' ? nestPath : ''
    const name = ref === COPY_STORE_ALL_REF_LOCAL ? 'Copy Store (all)' : ref || 'Copy Store'
    return path ? `${name} → ${path}` : name
  }

  const legacyKey = String(params.collectionKey ?? '').trim()
  if (legacyKey) return legacyKey

  return loopNode.data.label || actionId
}

function frameFromLoop(
  loopNode: PlannerNode,
  plan: AutomationPlan | null | undefined,
): LoopScopeFrame {
  const actionId = resolveActionAlias(loopNode.data.actionId).actionId
  const itemVariable =
    String(loopNode.data.params.itemVariable ?? 'item').trim() || 'item'
  const indexVariable =
    String(
      loopNode.data.params.indexVariable ?? (actionId === 'loops.for' ? 'i' : 'index'),
    ).trim() || 'index'
  return {
    loopNodeId: loopNode.id,
    actionId,
    label: loopNode.data.label || actionId,
    itemVariable,
    indexVariable,
    sampleItem: sampleItemFromLoopParams(loopNode, plan),
    collectionLabel: collectionLabelFromLoopParams(loopNode, plan),
  }
}

/**
 * Design-time: is this node inside a Map/For loop body, on a completed path, or outside?
 */
export function resolveLoopScope(
  workflow: VisualWorkflow,
  nodeId: string,
  plan?: AutomationPlan | null,
): LoopScope {
  const loopNodes = workflow.nodes.filter((node) => isLoopActionId(node.data.actionId))
  if (!loopNodes.length) return { kind: 'outside' }

  const bodyMembership: LoopScopeFrame[] = []
  let completedHit:
    | { loopNodeId: string; actionId: string; label: string }
    | undefined

  for (const loop of loopNodes) {
    const loopStarts = outgoingTargets(workflow, loop.id, 'loop')
    const completedStarts = outgoingTargets(workflow, loop.id, 'completed')

    const blockFromLoop = new Map<string, Set<string>>([
      [loop.id, new Set(['completed', 'loop'])],
    ])

    const body = collectReachable(workflow, loopStarts, {
      stopAt: new Set([loop.id]),
      blockSourceHandles: blockFromLoop,
    })
    // Nodes reached from loop handle are in the body (not the loop node itself)
    body.delete(loop.id)

    const completed = collectReachable(workflow, completedStarts, {
      stopAt: new Set([loop.id]),
      blockSourceHandles: new Map([[loop.id, new Set(['loop'])]]),
    })
    completed.delete(loop.id)

    if (body.has(nodeId)) {
      bodyMembership.push(frameFromLoop(loop, plan))
    } else if (completed.has(nodeId) && !completedHit) {
      completedHit = {
        loopNodeId: loop.id,
        actionId: resolveActionAlias(loop.data.actionId).actionId,
        label: loop.data.label || loop.data.actionId,
      }
    }
  }

  if (bodyMembership.length) {
    // Outer → inner: sort by nesting (node that contains another's loop node in body is outer)
    // Simple heuristic: keep discovery order; prefer shorter body distance later if needed
    return { kind: 'body', stack: bodyMembership }
  }

  if (completedHit) {
    return {
      kind: 'completed',
      loopNodeId: completedHit.loopNodeId,
      actionId: completedHit.actionId,
      label: completedHit.label,
    }
  }

  return { kind: 'outside' }
}

/** True when TypeText should bind to loop item fields instead of workflow datasets. */
export function isInsideLoopBody(scope: LoopScope): boolean {
  return scope.kind === 'body'
}
