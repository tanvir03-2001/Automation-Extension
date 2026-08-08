import { z } from 'zod'

export const StepExecutionStatusSchema = z.enum([
  'success',
  'failed',
  'timeout',
  'waiting',
  'skipped',
  'retrying',
  'pending',
  'running',
])

export type StepExecutionStatus = z.infer<typeof StepExecutionStatusSchema>

export const ErrorPolicySchema = z.object({
  strategy: z
    .enum([
      'retry',
      'retry_forever',
      'ignore',
      'stop',
      'goto_step',
      'run_workflow',
      'recovery_workflow',
      'notify',
      'screenshot',
      'log',
    ])
    .default('stop'),
  maxRetries: z.number().int().min(0).max(100).default(3),
  retryDelayMs: z.number().int().min(0).default(1000),
  gotoStepId: z.string().optional(),
  workflowId: z.string().optional(),
  notifyMessage: z.string().optional(),
})

export type ErrorPolicy = z.infer<typeof ErrorPolicySchema>

export const SelectorConfigSchema = z.object({
  primary: z.string().default(''),
  fallbacks: z.array(z.string()).default([]),
  strategy: z
    .enum(['css', 'xpath', 'text', 'attribute', 'aria', 'role', 'name', 'placeholder', 'id', 'class'])
    .default('css'),
  autoHeal: z.boolean().default(true),
})

export type SelectorConfig = z.infer<typeof SelectorConfigSchema>

export const PlannerNodeDataSchema = z.object({
  actionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  collapsed: z.boolean().default(false),
  color: z.string().optional(),
  favorite: z.boolean().default(false),
  groupId: z.string().optional(),
  params: z.record(z.unknown()).default({}),
  selector: SelectorConfigSchema.optional(),
  errorPolicy: ErrorPolicySchema.optional(),
  timeoutMs: z.number().int().positive().default(30_000),
  outputKey: z.string().optional(),
})

export type PlannerNodeData = z.infer<typeof PlannerNodeDataSchema>

export interface PlannerNode {
  id: string
  type: 'action' | 'start' | 'end' | 'note'
  position: { x: number; y: number }
  data: PlannerNodeData
  selected?: boolean
  dragging?: boolean
  width?: number
  height?: number
}

export interface PlannerEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  type?: string
  animated?: boolean
}

export interface WorkflowVersion {
  id: string
  label: string
  createdAt: string
  nodes: PlannerNode[]
  edges: PlannerEdge[]
}

export interface VisualWorkflow {
  id: string
  planId: string
  name: string
  description?: string
  enabled: boolean
  color?: string
  tags: string[]
  variables: Record<string, unknown>
  nodes: PlannerNode[]
  edges: PlannerEdge[]
  viewport: { x: number; y: number; zoom: number }
  versions: WorkflowVersion[]
  createdAt: string
  updatedAt: string
}

/** Named list of texts managed in the Planner (e.g. "story title") */
export interface PlanTextItem {
  id: string
  title: string
  text: string
}

export interface PlanTextLibrary {
  id: string
  name: string
  items: PlanTextItem[]
  updatedAt: string
}

/**
 * User-defined top-level JSON section on a Workflow (AutomationPlan).
 * Legacy — migrated into `datasets` on hydrate; kept for import compatibility.
 */
export interface PlanCustomSection {
  id: string
  title: string
  description?: string
  data: unknown
  updatedAt: string
}

/** Dataset kinds — custom JSON, or dual-written text list for TypeText. */
export type PlanDatasetKind = 'custom' | 'textLibrary' | 'legacyCustomSection'

/**
 * Dynamic Dataset on a Workflow (AutomationPlan).
 * Events reference datasets by id (no data copy). Names must be unique per plan.
 */
export interface PlanDataset {
  id: string
  name: string
  description?: string
  /** Arbitrary nested JSON — no fixed property names */
  data: unknown
  kind: PlanDatasetKind
  updatedAt: string
}

export interface AutomationPlan {
  id: string
  name: string
  description?: string
  color?: string
  tags: string[]
  workflowIds: string[]
  /** Shared text lists for TypeText (story titles, prompts, etc.) — dual-written from datasets */
  textLibraries: PlanTextLibrary[]
  /** @deprecated Prefer `datasets`. Kept for older exports / migration. */
  customSections: PlanCustomSection[]
  /** Canonical dynamic Dataset manager store */
  datasets: PlanDataset[]
  createdAt: string
  updatedAt: string
}

export interface ExecutionCheckpoint {
  id: string
  planId: string
  workflowId: string
  runId: string
  currentNodeId: string | null
  previousNodeId: string | null
  status: 'running' | 'paused' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  variables: Record<string, unknown>
  temporaryVariables: Record<string, unknown>
  retryCount: number
  loopCounts: Record<string, number>
  history: Array<{
    nodeId: string
    status: StepExecutionStatus
    at: string
    error?: string
    output?: unknown
  }>
  browserState: {
    activeTabId?: number
  }
  updatedAt: string
}

export interface PlannerWorkspace {
  plans: AutomationPlan[]
  workflows: VisualWorkflow[]
  favorites: string[]
  theme: 'light' | 'dark'
  /** UI language: English or simple Bangla */
  locale?: 'en' | 'bn'
  updatedAt: string
}
