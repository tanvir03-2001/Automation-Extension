import { z } from 'zod'

export const StepTypeSchema = z.enum([
  'open_url',
  'switch_tab',
  'wait_for_element',
  'wait_for_text',
  'wait_ms',
  'click',
  'type_text',
  'fill_form',
  'select_option',
  'press_key',
  'scroll',
  'extract_text',
  'extract_attribute',
  'download_file',
  'organize_folder',
  'chatgpt_prompt',
  'image_generate',
  'tts_generate',
  'set_variable',
  'assert_element',
  'custom_script',
])

export type StepType = z.infer<typeof StepTypeSchema>

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).max(20).default(3),
  backoffMs: z.number().int().min(0).default(1000),
  backoffMultiplier: z.number().min(1).default(2),
  retryOn: z.array(z.string()).default(['TimeoutError', 'ElementNotFoundError']),
})

export type RetryPolicy = z.infer<typeof RetryPolicySchema>

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  type: StepTypeSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30_000),
  retry: RetryPolicySchema.optional(),
  continueOnError: z.boolean().default(false),
  params: z.record(z.unknown()).default({}),
  outputKey: z.string().optional(),
})

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  variables: z.record(z.unknown()).default({}),
  steps: z.array(WorkflowStepSchema).min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

export type WorkflowRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'retrying'

export interface StepRunState {
  stepId: string
  name: string
  type: StepType
  status: StepRunStatus
  attempt: number
  startedAt?: string
  finishedAt?: string
  error?: string
  output?: unknown
}

export interface WorkflowRunState {
  runId: string
  workflowId: string
  workflowName: string
  status: WorkflowRunStatus
  currentStepIndex: number
  progress: number
  steps: StepRunState[]
  variables: Record<string, unknown>
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface ActivityLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success' | 'debug'
  source: string
  message: string
  meta?: Record<string, unknown>
}

export interface QueueJob {
  id: string
  workflowId: string
  priority: number
  createdAt: string
  status: 'pending' | 'active' | 'done' | 'failed' | 'cancelled'
}
