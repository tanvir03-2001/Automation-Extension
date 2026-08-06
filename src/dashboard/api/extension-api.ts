import { sendRuntimeMessage } from '@/shared/messaging/bus'
import type { WorkflowDefinition, WorkflowRunState, ActivityLogEntry, QueueJob } from '@/shared/types/workflow'

export async function fetchWorkflows(): Promise<WorkflowDefinition[]> {
  const response = await sendRuntimeMessage<{ ok: boolean; value: WorkflowDefinition[] }>({
    type: 'STORAGE_GET',
    payload: { key: 'workflows', fallback: [] },
  })
  return response.value ?? []
}

export async function fetchRunState(): Promise<WorkflowRunState | null> {
  const response = await sendRuntimeMessage<{ ok: boolean; run: WorkflowRunState | null }>({
    type: 'WORKFLOW_STATE',
  })
  return response.run ?? null
}

export async function fetchQueue(): Promise<QueueJob[]> {
  const response = await sendRuntimeMessage<{ ok: boolean; queue: QueueJob[] }>({
    type: 'QUEUE_STATE',
  })
  return response.queue ?? []
}

export async function fetchLogs(): Promise<ActivityLogEntry[]> {
  const response = await sendRuntimeMessage<{ ok: boolean; logs: ActivityLogEntry[] }>({
    type: 'ACTIVITY_LIST',
  })
  return response.logs ?? []
}

export async function clearLogs(): Promise<void> {
  await sendRuntimeMessage({ type: 'ACTIVITY_CLEAR' })
}

export async function reloadExtension(): Promise<void> {
  await sendRuntimeMessage({ type: 'EXTENSION_RELOAD' })
}

export async function startWorkflow(workflow: WorkflowDefinition): Promise<WorkflowRunState | null> {
  const response = await sendRuntimeMessage<{ ok: boolean; run: WorkflowRunState }>({
    type: 'WORKFLOW_START',
    payload: { workflow },
  })
  return response.run ?? null
}

export async function pauseWorkflow(): Promise<void> {
  await sendRuntimeMessage({ type: 'WORKFLOW_PAUSE' })
}

export async function resumeWorkflow(): Promise<void> {
  await sendRuntimeMessage({ type: 'WORKFLOW_RESUME' })
}

export async function cancelWorkflow(): Promise<void> {
  await sendRuntimeMessage({ type: 'WORKFLOW_CANCEL' })
}

export async function enqueueWorkflow(workflowId: string, priority = 0): Promise<void> {
  await sendRuntimeMessage({
    type: 'QUEUE_ENQUEUE',
    payload: { workflowId, priority },
  })
}
