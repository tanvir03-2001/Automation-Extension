import type { WorkflowDefinition, WorkflowRunState, ActivityLogEntry, QueueJob } from './workflow'

export type MessageType =
  | 'OPEN_DASHBOARD'
  | 'WORKFLOW_START'
  | 'WORKFLOW_PAUSE'
  | 'WORKFLOW_RESUME'
  | 'WORKFLOW_CANCEL'
  | 'WORKFLOW_STATE'
  | 'QUEUE_ENQUEUE'
  | 'QUEUE_STATE'
  | 'ACTIVITY_APPEND'
  | 'ACTIVITY_LIST'
  | 'ACTIVITY_CLEAR'
  | 'EXTENSION_RELOAD'
  | 'TEST_SELECTOR'
  | 'TRUSTED_CLICK'
  | 'AUTOMATION_COMMAND'
  | 'AUTOMATION_RESULT'
  | 'STORAGE_GET'
  | 'STORAGE_SET'
  | 'PICK_ELEMENT_START'
  | 'PICK_ELEMENT_RESULT'
  | 'CONTENT_PING'
  | 'OPEN_URL'
  | 'RUN_GUARD_LOCK'
  | 'RUN_GUARD_UNLOCK'
  | 'RUN_GUARD_REFRESH'
  | 'PLANNER_START'
  | 'PLANNER_PAUSE'
  | 'PLANNER_RESUME'
  | 'PLANNER_CANCEL'
  | 'PLANNER_STATE'
  | 'PING'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  requestId?: string
  payload?: T
}

export interface AutomationCommand {
  action:
    | 'click'
    | 'clickSend'
    | 'type'
    | 'fill'
    | 'paste'
    | 'waitForElement'
    | 'waitForElementVisible'
    | 'waitForElementHidden'
    | 'waitForClickable'
    | 'waitForText'
    | 'waitForExactText'
    | 'waitForTextGone'
    | 'waitForButton'
    | 'waitForGenerationEnd'
    | 'extractText'
    | 'extractAttribute'
    | 'select'
    | 'pressKey'
    | 'scroll'
    | 'getPageState'
    | 'assertElement'
    | 'checkElementVisible'
    | 'checkCondition'
    | 'testSelector'
  selector?: string
  /** Alternative selectors tried if primary fails (text / aria / svg / css path). */
  fallbacks?: string[]
  text?: string
  value?: string
  attribute?: string
  key?: string
  timeoutMs?: number
  options?: Record<string, unknown>
}

export interface AutomationResult {
  ok: boolean
  data?: unknown
  error?: string
}

export interface WorkflowStartPayload {
  workflow: WorkflowDefinition
  variables?: Record<string, unknown>
}

export interface DashboardBootstrap {
  run: WorkflowRunState | null
  queue: QueueJob[]
  logs: ActivityLogEntry[]
  workflows: WorkflowDefinition[]
}
