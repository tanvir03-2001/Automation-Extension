import { createId } from '@/shared/utils/id'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import { activityLog } from '@/engine/activity/activity-log'
import { sleep } from '@/engine/retry/retry-policy'
import { runGuardController } from '@/background/run-guard-controller'
import { executePlannerAction } from '@/planner/engine/action-executor'
import { resetWorkflowQueueCursors } from '@/planner/engine/text-library'
import type {
  ExecutionCheckpoint,
  PlannerEdge,
  PlannerNode,
  StepExecutionStatus,
  VisualWorkflow,
} from '@/planner/types/plan'

const CHECKPOINT_KEY = 'planner-checkpoint'

type Listener = (checkpoint: ExecutionCheckpoint | null) => void

function outgoing(edges: PlannerEdge[], nodeId: string, handle?: string): PlannerEdge[] {
  return edges.filter((edge) => {
    if (edge.source !== nodeId) return false
    if (!handle) return !edge.sourceHandle || edge.sourceHandle === 'out'
    return edge.sourceHandle === handle
  })
}

function findStart(nodes: PlannerNode[]): PlannerNode | undefined {
  return (
    nodes.find((node) => node.data.actionId === 'flow.start' || node.type === 'start') ??
    nodes[0]
  )
}

/** Resolve jump targets after import remaps node ids (legacy n_new_chat → real id). */
function resolveNodeRef(workflow: VisualWorkflow, ref: string): string | null {
  if (!ref) return null
  if (workflow.nodes.some((node) => node.id === ref)) return ref

  const needle = ref.toLowerCase()
  const byLabel = workflow.nodes.find((node) => {
    const label = node.data.label.toLowerCase()
    if (needle.includes('new_chat') || needle.includes('new chat')) {
      return label.includes('new chat') || label.includes('newchat')
    }
    return label === needle || node.id.toLowerCase() === needle
  })
  if (byLabel) return byLabel.id

  // Fallback: click step that feeds TypeText in the story-batch pattern
  const typeNode = workflow.nodes.find(
    (node) =>
      node.data.actionId === 'keyboard.type_text' ||
      node.data.actionId === 'keyboard.paste_text',
  )
  if (typeNode) {
    const inbound = workflow.edges.find((edge) => edge.target === typeNode.id)
    if (inbound && workflow.nodes.some((node) => node.id === inbound.source)) {
      return inbound.source
    }
  }
  return null
}

export class PlannerRunner {
  private checkpoint: ExecutionCheckpoint | null = null
  private workflows = new Map<string, VisualWorkflow>()
  private listeners = new Set<Listener>()
  private pauseRequested = false
  private cancelRequested = false
  private executing = false

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.checkpoint)
    return () => this.listeners.delete(listener)
  }

  getCheckpoint(): ExecutionCheckpoint | null {
    return this.checkpoint
  }

  registerWorkflows(workflows: VisualWorkflow[]): void {
    this.workflows = new Map(workflows.map((wf) => [wf.id, wf]))
  }

  async hydrate(): Promise<void> {
    this.checkpoint = await storageGet<ExecutionCheckpoint | null>(CHECKPOINT_KEY, null)
    this.emit()
  }

  async start(workflow: VisualWorkflow, variables: Record<string, unknown> = {}): Promise<void> {
    if (this.executing) throw new Error('Planner already running')
    this.workflows.set(workflow.id, workflow)
    this.pauseRequested = false
    this.cancelRequested = false

    // Each Run starts library queues from the first selected title
    await resetWorkflowQueueCursors(workflow.id)

    const start = findStart(workflow.nodes)
    this.checkpoint = {
      id: createId('ckpt'),
      planId: workflow.planId,
      workflowId: workflow.id,
      runId: createId('prun'),
      currentNodeId: start?.id ?? null,
      previousNodeId: null,
      status: 'running',
      variables: { ...workflow.variables, ...variables },
      temporaryVariables: {},
      retryCount: 0,
      loopCounts: {},
      history: [],
      browserState: {},
      updatedAt: new Date().toISOString(),
    }

    runGuardController.start()
    await this.persist()
    await activityLog.append('info', 'PlannerRunner', `Started visual workflow: ${workflow.name}`)
    void this.loop()
  }

  async resumeFromCheckpoint(): Promise<void> {
    if (!this.checkpoint) await this.hydrate()
    if (!this.checkpoint) throw new Error('No checkpoint to resume')
    if (this.executing) return
    this.pauseRequested = false
    this.cancelRequested = false
    this.checkpoint.status = 'running'
    runGuardController.start()
    await this.persist()
    void this.loop()
  }

  pause(): void {
    this.pauseRequested = true
  }

  cancel(): void {
    this.cancelRequested = true
    if (this.checkpoint) {
      this.checkpoint.status = 'cancelled'
      this.checkpoint.updatedAt = new Date().toISOString()
      void this.persist()
    } else {
      void runGuardController.stop()
    }
  }

  /** Wipe run checkpoint + history (used by Clear log). */
  async clearCheckpoint(): Promise<void> {
    this.cancelRequested = true
    this.pauseRequested = false
    this.checkpoint = null
    await storageSet(CHECKPOINT_KEY, null)
    await runGuardController.stop()
    this.emit()
  }

  private async loop(): Promise<void> {
    if (!this.checkpoint || this.executing) return
    this.executing = true

    try {
      while (this.checkpoint.currentNodeId) {
        if (this.cancelRequested) {
          this.checkpoint.status = 'cancelled'
          break
        }
        if (this.pauseRequested) {
          this.checkpoint.status = 'paused'
          await this.persist()
          break
        }

        const workflow = this.workflows.get(this.checkpoint.workflowId)
        if (!workflow) throw new Error('Workflow missing for checkpoint')

        const node = workflow.nodes.find((item) => item.id === this.checkpoint!.currentNodeId)
        if (!node) {
          this.checkpoint.status = 'failed'
          this.checkpoint.history.push({
            nodeId: this.checkpoint.currentNodeId,
            status: 'failed',
            at: new Date().toISOString(),
            error: 'Node not found',
          })
          break
        }

        if (!node.data.enabled) {
          this.pushHistory(node.id, 'skipped')
          this.advance(workflow, node.id)
          await this.persist()
          continue
        }

        if (node.data.actionId === 'flow.end' || node.type === 'end') {
          this.pushHistory(node.id, 'success')
          this.checkpoint.currentNodeId = null
          this.checkpoint.status = 'completed'
          await this.persist()
          await activityLog.append('success', 'PlannerRunner', 'Visual workflow completed')
          break
        }

        // Persist before long actions so the UI can highlight this step immediately
        this.checkpoint.status = 'running'
        await this.persist()

        const policy = node.data.errorPolicy
        let attempt = 0
        let resultStatus: StepExecutionStatus = 'failed'
        let done = false

        while (!done) {
          attempt += 1
          this.checkpoint.retryCount = attempt
          const result = await executePlannerAction({
            actionId: node.data.actionId,
            params: {
              ...node.data.params,
              selector: node.data.selector?.primary || node.data.params.selector,
              selectorFallbacks:
                node.data.selector?.fallbacks ?? node.data.params.selectorFallbacks,
            },
            variables: {
              ...this.checkpoint.variables,
              ...this.checkpoint.temporaryVariables,
            },
            activeTabId: this.checkpoint.browserState.activeTabId,
            timeoutMs: node.data.timeoutMs,
            workflowId: this.checkpoint.workflowId,
            nodeId: node.id,
            planId: this.checkpoint.planId,
          })

          if (result.activeTabId !== undefined) {
            this.checkpoint.browserState.activeTabId = result.activeTabId
            if (runGuardController.isEnabled()) {
              await runGuardController.lockTab(result.activeTabId)
            }
          }
          if (result.variables) {
            for (const [key, value] of Object.entries(result.variables)) {
              if (value === undefined) {
                delete this.checkpoint.variables[key]
              } else {
                this.checkpoint.variables[key] = value
              }
            }
          }

          if (result.status === 'waiting' || node.data.actionId === 'flow.pause') {
            this.pushHistory(node.id, 'waiting')
            this.checkpoint.status = 'paused'
            await this.persist()
            return
          }

          if (result.status === 'success') {
            resultStatus = 'success'
            this.pushHistory(node.id, 'success', undefined, result.output)

            if (result.nextNodeId === null) {
              this.checkpoint.currentNodeId = null
              this.checkpoint.status = 'completed'
              await this.persist()
              return
            }

            if (result.nextNodeId) {
              const resolved =
                resolveNodeRef(workflow, result.nextNodeId) ?? result.nextNodeId
              if (!workflow.nodes.some((item) => item.id === resolved)) {
                this.pushHistory(
                  node.id,
                  'failed',
                  `Jump target not found: ${result.nextNodeId}. Re-import the plan or set Repeat target to New chat node id.`,
                )
                this.checkpoint.status = 'failed'
                await this.persist()
                return
              }
              this.checkpoint.previousNodeId = node.id
              this.checkpoint.currentNodeId = resolved
            } else if (result.branch === 'nested' && result.output) {
              const nestedId = String((result.output as { nestedWorkflowId?: string }).nestedWorkflowId)
              const nested = this.workflows.get(nestedId)
              if (!nested) throw new Error(`Nested workflow missing: ${nestedId}`)
              // Save return pointer then jump into nested start
              this.checkpoint.temporaryVariables.__returnWorkflowId = workflow.id
              this.checkpoint.temporaryVariables.__returnNodeId = outgoing(workflow.edges, node.id)[0]?.target
              this.checkpoint.workflowId = nested.id
              this.checkpoint.previousNodeId = node.id
              this.checkpoint.currentNodeId = findStart(nested.nodes)?.id ?? null
            } else {
              this.advance(workflow, node.id, result.branch)
            }

            done = true
            break
          }

          const canRetry =
            policy?.strategy === 'retry_forever' ||
            (policy?.strategy === 'retry' && attempt < (policy.maxRetries ?? 3))

          if (canRetry) {
            resultStatus = 'retrying'
            this.pushHistory(node.id, 'retrying', result.error)
            await this.persist()
            await sleep(policy?.retryDelayMs ?? 1000)
            continue
          }

          if (policy?.strategy === 'ignore') {
            resultStatus = 'failed'
            this.pushHistory(node.id, 'failed', result.error)
            this.advance(workflow, node.id)
            done = true
            break
          }

          if (policy?.strategy === 'goto_step' && policy.gotoStepId) {
            this.pushHistory(node.id, 'failed', result.error)
            this.checkpoint.previousNodeId = node.id
            this.checkpoint.currentNodeId = policy.gotoStepId
            done = true
            break
          }

          resultStatus = result.status === 'timeout' ? 'timeout' : 'failed'
          this.pushHistory(node.id, resultStatus, result.error)
          this.checkpoint.status = 'failed'
          await activityLog.append('error', 'PlannerRunner', result.error ?? 'Step failed', {
            nodeId: node.id,
            actionId: node.data.actionId,
          })
          await this.persist()
          return
        }

        await this.persist()
      }

      if (this.checkpoint.status === 'running' && !this.checkpoint.currentNodeId) {
        this.checkpoint.status = 'completed'
      }
      await this.persist()
    } finally {
      this.executing = false
    }
  }

  private advance(workflow: VisualWorkflow, nodeId: string, branch?: string): void {
    if (!this.checkpoint) return
    const edges = branch
      ? outgoing(workflow.edges, nodeId, branch)
      : outgoing(workflow.edges, nodeId)
    const next = edges[0]?.target ?? null
    this.checkpoint.previousNodeId = nodeId
    this.checkpoint.currentNodeId = next

    if (
      next == null &&
      this.checkpoint.temporaryVariables.__returnWorkflowId &&
      this.checkpoint.temporaryVariables.__returnNodeId
    ) {
      this.checkpoint.workflowId = String(this.checkpoint.temporaryVariables.__returnWorkflowId)
      this.checkpoint.currentNodeId = String(this.checkpoint.temporaryVariables.__returnNodeId)
      delete this.checkpoint.temporaryVariables.__returnWorkflowId
      delete this.checkpoint.temporaryVariables.__returnNodeId
    }
  }

  private pushHistory(
    nodeId: string,
    status: StepExecutionStatus,
    error?: string,
    output?: unknown,
  ): void {
    if (!this.checkpoint) return
    this.checkpoint.history.push({
      nodeId,
      status,
      at: new Date().toISOString(),
      error,
      output,
    })
  }

  private async persist(): Promise<void> {
    if (this.checkpoint) {
      this.checkpoint.updatedAt = new Date().toISOString()
    }
    await storageSet(CHECKPOINT_KEY, this.checkpoint)
    this.emit()
    await this.syncRunGuard()
  }

  private async syncRunGuard(): Promise<void> {
    const cp = this.checkpoint
    if (cp?.status === 'running') {
      runGuardController.start()
      if (cp.browserState.activeTabId != null) {
        await runGuardController.lockTab(cp.browserState.activeTabId)
      }
      return
    }
    // Pause / complete / fail / cancel → unlock the page so the user can click again
    await runGuardController.stop()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.checkpoint)
  }
}

export const plannerRunner = new PlannerRunner()
