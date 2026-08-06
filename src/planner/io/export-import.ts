import { nanoid } from 'nanoid'
import type { AutomationPlan, PlannerEdge, PlannerNode, VisualWorkflow } from '@/planner/types/plan'
import type { WorkflowDefinition } from '@/shared/types/workflow'

export type ExportKind = 'workspace' | 'plan' | 'workflow' | 'snippet' | 'legacy-workflow'

export interface WorkspacePayload {
  kind: 'workspace'
  version: 1
  exportedAt: string
  plans: AutomationPlan[]
  workflows: VisualWorkflow[]
  favorites?: string[]
  theme?: 'light' | 'dark'
}

export interface PlanPayload {
  kind: 'plan'
  version: 1
  exportedAt: string
  plan: AutomationPlan
  workflows: VisualWorkflow[]
}

export interface WorkflowPayload {
  kind: 'workflow'
  version: 1
  exportedAt: string
  workflow: VisualWorkflow
}

export interface SnippetPayload {
  kind: 'snippet'
  version: 1
  exportedAt: string
  name?: string
  nodes: PlannerNode[]
  edges: PlannerEdge[]
  variables?: Record<string, unknown>
}

export interface LegacyWorkflowPayload {
  kind: 'legacy-workflow'
  version: 1
  exportedAt: string
  workflow: WorkflowDefinition
}

export type AnyExportPayload =
  | WorkspacePayload
  | PlanPayload
  | WorkflowPayload
  | SnippetPayload
  | LegacyWorkflowPayload

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text) as unknown
}

export function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export function buildWorkspaceExport(args: {
  plans: AutomationPlan[]
  workflows: VisualWorkflow[]
  favorites?: string[]
  theme?: 'light' | 'dark'
}): WorkspacePayload {
  return {
    kind: 'workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    plans: args.plans,
    workflows: args.workflows,
    favorites: args.favorites,
    theme: args.theme,
  }
}

export function buildPlanExport(
  plan: AutomationPlan,
  workflows: VisualWorkflow[],
): PlanPayload {
  return {
    kind: 'plan',
    version: 1,
    exportedAt: new Date().toISOString(),
    plan,
    workflows: workflows.filter((wf) => wf.planId === plan.id || plan.workflowIds.includes(wf.id)),
  }
}

export function buildWorkflowExport(workflow: VisualWorkflow): WorkflowPayload {
  return {
    kind: 'workflow',
    version: 1,
    exportedAt: new Date().toISOString(),
    workflow,
  }
}

export function buildSnippetExport(args: {
  name?: string
  nodes: PlannerNode[]
  edges: PlannerEdge[]
  variables?: Record<string, unknown>
}): SnippetPayload {
  const nodeIds = new Set(args.nodes.map((node) => node.id))
  return {
    kind: 'snippet',
    version: 1,
    exportedAt: new Date().toISOString(),
    name: args.name,
    nodes: args.nodes,
    edges: args.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    variables: args.variables,
  }
}

export function buildLegacyWorkflowExport(workflow: WorkflowDefinition): LegacyWorkflowPayload {
  return {
    kind: 'legacy-workflow',
    version: 1,
    exportedAt: new Date().toISOString(),
    workflow,
  }
}

export function detectPayload(raw: unknown): AnyExportPayload {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid JSON')
  const data = raw as Record<string, unknown>

  if (
    data.kind === 'workspace' ||
    data.kind === 'plan' ||
    data.kind === 'workflow' ||
    data.kind === 'snippet' ||
    data.kind === 'legacy-workflow'
  ) {
    return data as unknown as AnyExportPayload
  }

  // Backward compatible: old workspace without kind
  if (Array.isArray(data.plans) && Array.isArray(data.workflows)) {
    return {
      kind: 'workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: data.plans as AutomationPlan[],
      workflows: data.workflows as VisualWorkflow[],
      favorites: data.favorites as string[] | undefined,
      theme: data.theme as 'light' | 'dark' | undefined,
    }
  }

  // Bare visual workflow
  if (data.nodes && data.edges && data.id && data.planId) {
    return {
      kind: 'workflow',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflow: data as unknown as VisualWorkflow,
    }
  }

  // Bare legacy workflow
  if (data.steps && data.id && data.name) {
    return {
      kind: 'legacy-workflow',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflow: data as unknown as WorkflowDefinition,
    }
  }

  // Bare snippet
  if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
    return {
      kind: 'snippet',
      version: 1,
      exportedAt: new Date().toISOString(),
      nodes: data.nodes as PlannerNode[],
      edges: data.edges as PlannerEdge[],
      name: typeof data.name === 'string' ? data.name : undefined,
    }
  }

  throw new Error('Unrecognized plan/workflow JSON format')
}

const NODE_REF_PARAM_KEYS = ['targetNodeId', 'gotoStepId', 'gotoNodeId', 'returnNodeId'] as const

/** Rewrite node-id references inside step params / error policies after ID remap */
function rewriteNodeDataRefs(
  data: PlannerNode['data'],
  idMap: Map<string, string>,
): PlannerNode['data'] {
  const params = { ...data.params }
  for (const key of NODE_REF_PARAM_KEYS) {
    const value = params[key]
    if (typeof value === 'string' && idMap.has(value)) {
      params[key] = idMap.get(value)!
    }
  }

  let errorPolicy = data.errorPolicy
  if (errorPolicy?.gotoStepId && idMap.has(errorPolicy.gotoStepId)) {
    errorPolicy = {
      ...errorPolicy,
      gotoStepId: idMap.get(errorPolicy.gotoStepId)!,
    }
  }

  return { ...data, params, errorPolicy }
}

export function remapSnippetIds(
  nodes: PlannerNode[],
  edges: PlannerEdge[],
  offset = { x: 40, y: 40 },
): { nodes: PlannerNode[]; edges: PlannerEdge[] } {
  const idMap = new Map<string, string>()
  for (const node of nodes) {
    idMap.set(node.id, `n_${nanoid(8)}`)
  }
  const nextNodes = nodes.map((node) => {
    const cloned = structuredClone(node)
    return {
      ...cloned,
      id: idMap.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: false,
      data: rewriteNodeDataRefs(cloned.data, idMap),
    }
  })
  const nextEdges = edges.map((edge) => ({
    ...structuredClone(edge),
    id: `e_${nanoid(8)}`,
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }))
  return { nodes: nextNodes, edges: nextEdges }
}

export function remapWorkflowIds(workflow: VisualWorkflow, planId: string): VisualWorkflow {
  const idMap = new Map<string, string>()
  for (const node of workflow.nodes) {
    idMap.set(node.id, `n_${nanoid(8)}`)
  }
  const nodes = workflow.nodes.map((node) => {
    const cloned = structuredClone(node)
    return {
      ...cloned,
      id: idMap.get(node.id)!,
      selected: false,
      data: rewriteNodeDataRefs(cloned.data, idMap),
    }
  })
  const edges = workflow.edges.map((edge) => ({
    ...structuredClone(edge),
    id: `e_${nanoid(8)}`,
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }))
  return {
    ...structuredClone(workflow),
    id: `vwf_${nanoid(8)}`,
    planId,
    name: `${workflow.name} (imported)`,
    nodes,
    edges,
    versions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function remapPlanBundle(
  plan: AutomationPlan,
  workflows: VisualWorkflow[],
): { plan: AutomationPlan; workflows: VisualWorkflow[] } {
  const planId = `plan_${nanoid(8)}`
  const remapped = workflows.map((wf) => remapWorkflowIds(wf, planId))
  return {
    plan: {
      ...structuredClone(plan),
      id: planId,
      name: `${plan.name} (imported)`,
      workflowIds: remapped.map((wf) => wf.id),
      textLibraries: plan.textLibraries ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    workflows: remapped,
  }
}
