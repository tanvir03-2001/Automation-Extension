import { createId } from '@/shared/utils/id'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import { activityLog } from '@/engine/activity/activity-log'
import { sleep } from '@/engine/retry/retry-policy'
import { runGuardController } from '@/background/run-guard-controller'
import { executePlannerAction } from '@/planner/engine/action-executor'
import { resetWorkflowQueueCursors } from '@/planner/engine/text-library'
import { copyStore } from '@/engine/copy-store'
import { loadDurableWorkflowStore } from '@/engine/copy-store/durable'
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

    // Hydrate Copy Store library (durable) so previous Copy Events stay available
    // and numbering continues (story-4 after story-1..3) — like Text libraries.
    const durableStore = await loadDurableWorkflowStore(workflow.id)
    copyStore.resetRuntime(workflow.id)
    copyStore.hydrateRuntime({
      copyStore: durableStore,
      copyStores: { [workflow.id]: durableStore },
    })

    const start = findStart(workflow.nodes)
    const initialVariables: Record<string, unknown> = {
      ...workflow.variables,
      ...variables,
      copyStore: { ...durableStore },
      copyStores: { [workflow.id]: { ...durableStore } },
      __workflowId: workflow.id,
    }
    this.checkpoint = {
      id: createId('ckpt'),
      planId: workflow.planId,
      workflowId: workflow.id,
      runId: createId('prun'),
      currentNodeId: start?.id ?? null,
      previousNodeId: null,
      status: 'running',
      variables: initialVariables,
      temporaryVariables: {},
      retryCount: 0,
      loopCounts: {},
      history: [],
      browserState: {},
      updatedAt: new Date().toISOString(),
    }

    runGuardController.start()
    // Debugger bar ON immediately with Run / Flow Start — don't wait for Open URL.
    const debugTabId = await runGuardController.beginTrustedDebug(
      this.checkpoint.browserState.activeTabId,
    )
    if (debugTabId != null) {
      this.checkpoint.browserState.activeTabId = debugTabId
    }
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
    // Restore Copy Store so numbering continues (story-4 after story-1..3)
    copyStore.hydrateRuntime(this.checkpoint.variables)
    copyStore.syncActiveCopyStoreMirror(this.checkpoint.variables, this.checkpoint.workflowId)
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

  /** True while the main planner loop is stepping nodes. */
  isBusy(): boolean {
    return this.executing
  }

  /**
   * Merge variables from a Quick Test into the current checkpoint (same workflow).
   * Skipped while the main loop is actively executing a step.
   */
  async mergeVariablesFromTest(
    workflowId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (!this.checkpoint || this.checkpoint.workflowId !== workflowId) return
    if (this.executing) return
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete this.checkpoint.variables[key]
      else this.checkpoint.variables[key] = value
    }
    this.checkpoint.updatedAt = new Date().toISOString()
    await this.persist()
    this.emit()
  }

  /**
   * Sync a workflow Copy Store snapshot into checkpoint (UI delete/clear).
   * Updates copyStores[workflowId] even when that workflow is not the active one.
   */
  async syncCopyStoreSnapshot(
    workflowId: string,
    store: Record<string, unknown>,
  ): Promise<void> {
    if (!this.checkpoint) return
    // Allowed while running — Copy Store library edits must not bounce back from checkpoint
    const prevStores =
      this.checkpoint.variables.copyStores &&
      typeof this.checkpoint.variables.copyStores === 'object'
        ? { ...(this.checkpoint.variables.copyStores as Record<string, unknown>) }
        : {}
    prevStores[workflowId] = store
    this.checkpoint.variables.copyStores = prevStores
    if (this.checkpoint.workflowId === workflowId) {
      this.checkpoint.variables.copyStore = store
    }
    this.checkpoint.updatedAt = new Date().toISOString()
    await this.persist()
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
          // Debugger bar OFF at End (also mirrored in action-executor for explicit End nodes)
          await runGuardController.endTrustedDebug()
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
              __workflowId: this.checkpoint.workflowId,
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

            if (result.branch === 'execute_plan' && result.output) {
              const handoffError = await this.handoffToPlan(
                workflow,
                node.id,
                String((result.output as { nextWorkflowId?: string }).nextWorkflowId ?? ''),
              )
              if (handoffError) {
                this.pushHistory(node.id, 'failed', handoffError)
                this.checkpoint.status = 'failed'
                await activityLog.append('error', 'PlannerRunner', handoffError, {
                  nodeId: node.id,
                  actionId: node.data.actionId,
                })
                await this.persist()
                return
              }
              this.pushHistory(node.id, 'success', undefined, result.output)
              done = true
              break
            }

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
              copyStore.syncActiveCopyStoreMirror(this.checkpoint.variables, nested.id)
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

  /**
   * Explicit Plan→Plan handoff within the same AutomationPlan (UI Workflow).
   * Does NOT follow list order and does NOT return to the caller Plan.
   * Returns an error message on failure (caller marks the step failed).
   */
  private async handoffToPlan(
    source: VisualWorkflow,
    fromNodeId: string,
    nextWorkflowId: string,
  ): Promise<string | null> {
    if (!this.checkpoint) return 'Next Plan Execute: no active run'

    const targetId = nextWorkflowId.trim()
    if (!targetId) {
      return 'Next Plan Execute: no target plan selected'
    }
    if (targetId === source.id) {
      return 'Next Plan Execute cannot target the current plan'
    }

    // Refresh map so newly created sibling Plans are available
    const workspace = await storageGet<{ workflows?: VisualWorkflow[] }>('planner-workspace', {
      workflows: [],
    })
    if (Array.isArray(workspace.workflows) && workspace.workflows.length > 0) {
      this.registerWorkflows(workspace.workflows)
    }

    const next = this.workflows.get(targetId)
    if (!next) {
      return `Next Plan Execute: target plan not found (${targetId}). It may have been deleted.`
    }
    if (next.planId !== this.checkpoint.planId || next.planId !== source.planId) {
      return 'Next Plan Execute: target plan must belong to the same Workflow. Cross-workflow execution is not allowed.'
    }
    if (next.enabled === false) {
      return `Next Plan Execute: target plan “${next.name}” is disabled`
    }

    const start = findStart(next.nodes)
    if (!start) {
      return `Next Plan Execute: target plan “${next.name}” has no Start step`
    }

    // Clear nested-return pointers — this is a handoff, not a subflow
    delete this.checkpoint.temporaryVariables.__returnWorkflowId
    delete this.checkpoint.temporaryVariables.__returnNodeId

    await resetWorkflowQueueCursors(next.id)
    const durableStore = await loadDurableWorkflowStore(next.id)
    copyStore.resetRuntime(next.id)
    copyStore.hydrateRuntime({
      copyStore: durableStore,
      copyStores: {
        ...((this.checkpoint.variables.copyStores as Record<string, unknown> | undefined) ?? {}),
        [next.id]: durableStore,
      },
    })

    const prevStores =
      this.checkpoint.variables.copyStores &&
      typeof this.checkpoint.variables.copyStores === 'object'
        ? { ...(this.checkpoint.variables.copyStores as Record<string, unknown>) }
        : {}
    prevStores[next.id] = { ...durableStore }
    this.checkpoint.variables.copyStores = prevStores
    this.checkpoint.variables.copyStore = { ...durableStore }
    this.checkpoint.variables.__workflowId = next.id

    this.checkpoint.workflowId = next.id
    this.checkpoint.previousNodeId = fromNodeId
    this.checkpoint.currentNodeId = start.id
    this.checkpoint.status = 'running'
    this.checkpoint.updatedAt = new Date().toISOString()

    await activityLog.append(
      'info',
      'PlannerRunner',
      `Next Plan Execute: “${source.name}” → “${next.name}”`,
      { fromWorkflowId: source.id, toWorkflowId: next.id, planId: next.planId },
    )
    return null
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
      copyStore.syncActiveCopyStoreMirror(this.checkpoint.variables, this.checkpoint.workflowId)
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
    if (cp?.status === 'running' || cp?.status === 'paused') {
      // Page lock stays; CDP debugger is opened at Run/Start and closed by End/Stop.
      runGuardController.start()
      if (cp.status === 'running' && !runGuardController.isTrustedDebugActive()) {
        // SW wake mid-run: restore debugger without needing Start again
        const tabId = await runGuardController.beginTrustedDebug(cp.browserState.activeTabId)
        if (tabId != null) cp.browserState.activeTabId = tabId
      } else if (cp.browserState.activeTabId != null) {
        await runGuardController.lockTab(cp.browserState.activeTabId)
      }
      return
    }
    // Complete / fail / cancel → unlock page + close debugger bar
    await runGuardController.stop()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.checkpoint)
  }
}

export const plannerRunner = new PlannerRunner()
