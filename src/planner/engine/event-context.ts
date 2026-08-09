import { interpolate as interpolateTemplate } from '@/shared/utils/interpolate'
import { getByPath, setByPath } from '@/planner/engine/path-utils'
import type {
  AutomationPlan,
  ExecutionCheckpoint,
  PlanDataset,
  VisualWorkflow,
} from '@/planner/types/plan'

export interface EventContextArgs {
  variables: Record<string, unknown>
  temporaryVariables?: Record<string, unknown>
  datasets: PlanDataset[]
  history: ExecutionCheckpoint['history']
  workflow?: VisualWorkflow | null
  plan?: AutomationPlan | null
  nodeId?: string
  runId?: string
  activeTabId?: number
  planId?: string
  workflowId?: string
}

/**
 * Shared runtime context for every planner event (production + test).
 * Mutations to variables/datasets are collected and applied by the runner.
 */
export class EventContext {
  variables: Record<string, unknown>
  temporaryVariables: Record<string, unknown>
  datasets: PlanDataset[]
  history: ExecutionCheckpoint['history']
  workflow: VisualWorkflow | null
  plan: AutomationPlan | null
  nodeId?: string
  runId?: string
  activeTabId?: number
  planId?: string
  workflowId?: string

  /** Dataset ids mutated during this step (for workspace persist). */
  dirtyDatasetIds = new Set<string>()

  constructor(args: EventContextArgs) {
    this.variables = { ...args.variables }
    this.temporaryVariables = { ...(args.temporaryVariables ?? {}) }
    this.datasets = args.datasets.map((ds) => ({ ...ds }))
    this.history = args.history
    this.workflow = args.workflow ?? null
    this.plan = args.plan ?? null
    this.nodeId = args.nodeId
    this.runId = args.runId
    this.activeTabId = args.activeTabId
    this.planId = args.planId
    this.workflowId = args.workflowId
  }

  /** Merged view used for interpolation (temps shadow durable). */
  mergedVariables(): Record<string, unknown> {
    return {
      ...this.variables,
      ...this.temporaryVariables,
      __datasets: Object.fromEntries(this.datasets.map((ds) => [ds.name, ds.data])),
      __datasetsById: Object.fromEntries(this.datasets.map((ds) => [ds.id, ds.data])),
      __history: {
        last: this.history[this.history.length - 1] ?? null,
        length: this.history.length,
      },
    }
  }

  getVar(path: string): unknown {
    return getByPath(this.mergedVariables(), path)
  }

  setVar(path: string, value: unknown): void {
    const keys = path.trim().split('.').filter(Boolean)
    if (!keys.length) return
    if (keys.length === 1) {
      this.variables[keys[0]!] = value
      return
    }
    const rootKey = keys[0]!
    const rest = keys.slice(1).join('.')
    const current = this.variables[rootKey]
    this.variables[rootKey] = setByPath(current ?? {}, rest, value)
  }

  findDataset(ref: string): PlanDataset | undefined {
    const needle = ref.trim()
    if (!needle) return undefined
    return (
      this.datasets.find((ds) => ds.id === needle || ds.name === needle) ??
      this.datasets.find((ds) => ds.name.toLowerCase() === needle.toLowerCase())
    )
  }

  getDataset(ref: string, path = ''): unknown {
    const ds = this.findDataset(ref)
    if (!ds) return undefined
    if (!path.trim()) return ds.data
    return getByPath(ds.data, path)
  }

  setDataset(ref: string, data: unknown): void {
    const ds = this.findDataset(ref)
    if (!ds) throw new Error(`Dataset not found: ${ref}`)
    ds.data = data
    ds.updatedAt = new Date().toISOString()
    this.dirtyDatasetIds.add(ds.id)
  }

  updateDatasetPath(ref: string, path: string, value: unknown): void {
    const ds = this.findDataset(ref)
    if (!ds) throw new Error(`Dataset not found: ${ref}`)
    ds.data = setByPath(ds.data, path, value)
    ds.updatedAt = new Date().toISOString()
    this.dirtyDatasetIds.add(ds.id)
  }

  interpolate(template: string): string {
    return interpolateTemplate(template, this.mergedVariables())
  }

  /** Variables patch for checkpoint merge (excludes internal mirrors). */
  variablesPatch(): Record<string, unknown> {
    return { ...this.variables }
  }

  dirtyDatasets(): PlanDataset[] {
    return this.datasets.filter((ds) => this.dirtyDatasetIds.has(ds.id))
  }
}

export function createEventContext(args: EventContextArgs): EventContext {
  return new EventContext(args)
}
