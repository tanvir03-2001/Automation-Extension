import { createEventContext } from '@/planner/engine/event-context'
import { evaluateRunWhen, type DependencyEvalResult } from '@/planner/engine/dependency-eval'
import { runPreWait, type PreWaitResult } from '@/planner/engine/pre-wait'
import { resolveActionAlias } from '@/planner/engine/action-aliases'
import { executePlannerAction } from '@/planner/engine/action-executor'
import type { ActionHandlerResult } from '@/planner/actions/types'
import type {
  AutomationPlan,
  ExecutionCheckpoint,
  PlanDataset,
  PlannerNodeData,
  VisualWorkflow,
} from '@/planner/types/plan'

export interface TimelineEntry {
  at: string
  phase: string
  detail?: string
  ms?: number
}

export interface EventStepReport {
  skipped: boolean
  dependency: DependencyEvalResult
  preWait?: PreWaitResult
  result: ActionHandlerResult
  timeline: TimelineEntry[]
  performance: {
    totalMs: number
    dependencyMs: number
    preWaitMs: number
    handlerMs: number
  }
  datasets: PlanDataset[]
  dirtyDatasets: PlanDataset[]
  variables: Record<string, unknown>
  browserLogs: string[]
}

export async function runEventStep(args: {
  nodeData: PlannerNodeData
  variables: Record<string, unknown>
  temporaryVariables?: Record<string, unknown>
  datasets: PlanDataset[]
  history: ExecutionCheckpoint['history']
  workflow?: VisualWorkflow | null
  plan?: AutomationPlan | null
  activeTabId?: number
  workflowId?: string
  planId?: string
  nodeId?: string
  runId?: string
  /** When true, skip runWhen gate (already evaluated by caller). */
  skipDependencyGate?: boolean
}): Promise<EventStepReport> {
  const timeline: TimelineEntry[] = []
  const t0 = Date.now()
  const browserLogs: string[] = []

  const ctx = createEventContext({
    variables: args.variables,
    temporaryVariables: args.temporaryVariables,
    datasets: args.datasets,
    history: args.history,
    workflow: args.workflow,
    plan: args.plan,
    nodeId: args.nodeId,
    runId: args.runId,
    activeTabId: args.activeTabId,
    planId: args.planId,
    workflowId: args.workflowId,
  })

  const depStarted = Date.now()
  const dependency = evaluateRunWhen(ctx, args.nodeData.runWhen)
  const dependencyMs = Date.now() - depStarted
  timeline.push({
    at: new Date().toISOString(),
    phase: 'dependency',
    detail: dependency.enabled
      ? `logic=${dependency.logic} passed=${dependency.passed}`
      : 'no rules',
    ms: dependencyMs,
  })

  if (!args.skipDependencyGate && dependency.enabled && !dependency.passed) {
    return {
      skipped: true,
      dependency,
      result: {
        status: 'success',
        output: { skipped: true, dependency },
      },
      timeline,
      performance: {
        totalMs: Date.now() - t0,
        dependencyMs,
        preWaitMs: 0,
        handlerMs: 0,
      },
      datasets: ctx.datasets,
      dirtyDatasets: [],
      variables: ctx.variablesPatch(),
      browserLogs,
    }
  }

  const interaction = args.nodeData.interaction
  const preStarted = Date.now()
  let preWaitResult: PreWaitResult | undefined
  let activeTabId = args.activeTabId
  try {
    const pre = await runPreWait({
      preWait: args.nodeData.preWait,
      activeTabId,
      dismissOverlays: interaction?.dismissOverlays,
      stabilizeMs: interaction?.stabilizeMs,
    })
    preWaitResult = pre.result
    activeTabId = pre.activeTabId ?? activeTabId
    ctx.activeTabId = activeTabId
    timeline.push({
      at: new Date().toISOString(),
      phase: 'preWait',
      detail: preWaitResult.strategy,
      ms: preWaitResult.elapsedMs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    timeline.push({
      at: new Date().toISOString(),
      phase: 'preWait',
      detail: `failed: ${message}`,
      ms: Date.now() - preStarted,
    })
    return {
      skipped: false,
      dependency,
      preWait: { strategy: args.nodeData.preWait?.strategy ?? 'none', elapsedMs: Date.now() - preStarted, skipped: false, detail: message },
      result: { status: 'failed', error: message, activeTabId },
      timeline,
      performance: {
        totalMs: Date.now() - t0,
        dependencyMs,
        preWaitMs: Date.now() - preStarted,
        handlerMs: 0,
      },
      datasets: ctx.datasets,
      dirtyDatasets: [],
      variables: ctx.variablesPatch(),
      browserLogs,
    }
  }

  const alias = resolveActionAlias(args.nodeData.actionId)
  const handlerStarted = Date.now()
  const result = await executePlannerAction({
    actionId: alias.actionId,
    params: {
      ...alias.paramDefaults,
      ...args.nodeData.params,
      selector: args.nodeData.selector?.primary || args.nodeData.params.selector,
      selectorFallbacks:
        args.nodeData.selector?.fallbacks ?? args.nodeData.params.selectorFallbacks,
      __interaction: interaction,
      __eventContext: {
        datasets: ctx.datasets,
        history: ctx.history,
      },
    },
    variables: ctx.mergedVariables(),
    activeTabId,
    timeoutMs: args.nodeData.timeoutMs ?? 30_000,
    workflowId: args.workflowId,
    nodeId: args.nodeId,
    planId: args.planId,
    eventContext: ctx,
  })
  const handlerMs = Date.now() - handlerStarted
  timeline.push({
    at: new Date().toISOString(),
    phase: 'handler',
    detail: `${alias.actionId} → ${result.status}`,
    ms: handlerMs,
  })

  if (result.variables) {
    for (const [key, value] of Object.entries(result.variables)) {
      if (value === undefined) delete ctx.variables[key]
      else ctx.variables[key] = value
    }
  }
  if (result.activeTabId !== undefined) ctx.activeTabId = result.activeTabId

  // Pull dataset mutations written via eventContext helpers inside handlers
  const dirtyDatasets = ctx.dirtyDatasets()
  if (dirtyDatasets.length) {
    timeline.push({
      at: new Date().toISOString(),
      phase: 'dataset_write',
      detail: dirtyDatasets.map((ds) => ds.name).join(', '),
    })
  }

  return {
    skipped: false,
    dependency,
    preWait: preWaitResult,
    result: {
      ...result,
      output:
        result.output && typeof result.output === 'object'
          ? { ...(result.output as object), dependency, preWait: preWaitResult }
          : { value: result.output, dependency, preWait: preWaitResult },
      variables: ctx.variablesPatch(),
      activeTabId: ctx.activeTabId,
    },
    timeline,
    performance: {
      totalMs: Date.now() - t0,
      dependencyMs,
      preWaitMs: preWaitResult?.elapsedMs ?? Date.now() - preStarted,
      handlerMs,
    },
    datasets: ctx.datasets,
    dirtyDatasets,
    variables: ctx.variablesPatch(),
    browserLogs,
  }
}
