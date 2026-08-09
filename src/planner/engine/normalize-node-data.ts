import type {
  InteractionOptions,
  PlannerNode,
  PlannerNodeData,
  PreWait,
  RunWhen,
  VisualWorkflow,
} from '@/planner/types/plan'

const DEFAULT_INTERACTION: InteractionOptions = {
  scrollIntoView: true,
  dismissOverlays: false,
  waitEnabled: true,
  forceClick: false,
  stabilizeMs: 0,
}

const DEFAULT_PRE_WAIT: PreWait = {
  strategy: 'none',
  timeoutMs: 15_000,
}

const DEFAULT_RUN_WHEN: RunWhen = {
  logic: 'and',
  rules: [],
}

/** Fill missing execution-config fields so older plans stay valid. */
export function normalizeNodeData(data: PlannerNodeData): PlannerNodeData {
  return {
    ...data,
    runWhen: data.runWhen
      ? {
          logic: data.runWhen.logic === 'or' ? 'or' : 'and',
          rules: Array.isArray(data.runWhen.rules) ? data.runWhen.rules : [],
        }
      : { ...DEFAULT_RUN_WHEN },
    preWait: data.preWait
      ? {
          ...DEFAULT_PRE_WAIT,
          ...data.preWait,
          strategy: data.preWait.strategy ?? 'none',
        }
      : { ...DEFAULT_PRE_WAIT },
    interaction: data.interaction
      ? { ...DEFAULT_INTERACTION, ...data.interaction }
      : { ...DEFAULT_INTERACTION },
  }
}

export function normalizeWorkflowNodes(workflow: VisualWorkflow): VisualWorkflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map(
      (node): PlannerNode => ({
        ...node,
        data: normalizeNodeData(node.data),
      }),
    ),
  }
}

export function normalizeWorkflows(workflows: VisualWorkflow[]): VisualWorkflow[] {
  return workflows.map(normalizeWorkflowNodes)
}
