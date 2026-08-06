import { createId } from '@/shared/utils/id'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import type {
  WorkflowDefinition,
  WorkflowRunState,
  StepRunState,
  RetryPolicy,
} from '@/shared/types/workflow'
import { DEFAULT_RETRY_POLICY, shouldRetry, computeBackoffMs, sleep } from '@/engine/retry/retry-policy'
import { executeStep } from '@/engine/workflow/step-executor'
import { activityLog } from '@/engine/activity/activity-log'

const RUN_STORAGE_KEY = 'active-run'

type RunListener = (run: WorkflowRunState | null) => void

export class WorkflowRunner {
  private run: WorkflowRunState | null = null
  private workflow: WorkflowDefinition | null = null
  private pauseRequested = false
  private cancelRequested = false
  private listeners = new Set<RunListener>()
  private executing = false

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener)
    listener(this.run)
    return () => this.listeners.delete(listener)
  }

  getState(): WorkflowRunState | null {
    return this.run
  }

  async hydrate(): Promise<void> {
    this.run = await storageGet<WorkflowRunState | null>(RUN_STORAGE_KEY, null)
    this.emit()
  }

  async start(
    workflow: WorkflowDefinition,
    variables: Record<string, unknown> = {},
  ): Promise<WorkflowRunState> {
    if (this.executing) {
      throw new Error('A workflow is already running')
    }

    this.workflow = workflow
    this.pauseRequested = false
    this.cancelRequested = false

    const steps: StepRunState[] = workflow.steps.map((step) => ({
      stepId: step.id,
      name: step.name,
      type: step.type,
      status: step.enabled ? 'pending' : 'skipped',
      attempt: 0,
    }))

    this.run = {
      runId: createId('run'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      currentStepIndex: 0,
      progress: 0,
      steps,
      variables: { ...workflow.variables, ...variables },
      startedAt: new Date().toISOString(),
    }

    await this.persist()
    await activityLog.append('info', 'WorkflowRunner', `Started workflow: ${workflow.name}`, {
      runId: this.run.runId,
    })

    void this.loop()
    return this.run
  }

  pause(): void {
    if (this.run?.status === 'running') {
      this.pauseRequested = true
    }
  }

  resume(): void {
    if (this.run?.status === 'paused') {
      this.pauseRequested = false
      this.run.status = 'running'
      void this.persist()
      void this.loop()
    }
  }

  cancel(): void {
    this.cancelRequested = true
    if (this.run && ['running', 'paused', 'queued'].includes(this.run.status)) {
      this.run.status = 'cancelled'
      this.run.finishedAt = new Date().toISOString()
      void this.persist()
      void activityLog.append('warn', 'WorkflowRunner', 'Workflow cancelled', {
        runId: this.run.runId,
      })
    }
  }

  private async loop(): Promise<void> {
    if (!this.run || !this.workflow || this.executing) return
    this.executing = true

    try {
      let activeTabId: number | undefined

      while (this.run.currentStepIndex < this.workflow.steps.length) {
        if (this.cancelRequested) {
          this.run.status = 'cancelled'
          break
        }

        if (this.pauseRequested) {
          this.run.status = 'paused'
          await this.persist()
          break
        }

        const step = this.workflow.steps[this.run.currentStepIndex]
        const stepState = this.run.steps[this.run.currentStepIndex]

        if (!step.enabled) {
          stepState.status = 'skipped'
          this.run.currentStepIndex += 1
          this.updateProgress()
          await this.persist()
          continue
        }

        const policy: RetryPolicy = step.retry ?? DEFAULT_RETRY_POLICY
        stepState.status = 'running'
        stepState.startedAt = new Date().toISOString()
        await this.persist()

        let succeeded = false
        let attempt = 0

        while (attempt < Math.max(1, policy.maxAttempts)) {
          attempt += 1
          stepState.attempt = attempt

          try {
            const result = await executeStep(step, {
              variables: this.run.variables,
              activeTabId,
            })

            if (result.activeTabId) activeTabId = result.activeTabId
            if (result.variables) {
              this.run.variables = { ...this.run.variables, ...result.variables }
            }
            if (step.outputKey && result.output !== undefined) {
              this.run.variables[step.outputKey] = result.output
            }

            stepState.status = 'completed'
            stepState.output = result.output
            stepState.finishedAt = new Date().toISOString()
            succeeded = true
            await activityLog.append('success', 'WorkflowRunner', `Step completed: ${step.name}`, {
              stepId: step.id,
              attempt,
            })
            break
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            stepState.error = err.message

            if (shouldRetry(err, attempt, policy)) {
              stepState.status = 'retrying'
              const delay = computeBackoffMs(attempt, policy)
              await activityLog.append('warn', 'WorkflowRunner', `Retrying step: ${step.name}`, {
                attempt,
                delay,
                error: err.message,
              })
              await this.persist()
              await sleep(delay)
              continue
            }

            if (step.continueOnError) {
              stepState.status = 'failed'
              stepState.finishedAt = new Date().toISOString()
              await activityLog.append('warn', 'WorkflowRunner', `Step failed (continued): ${step.name}`, {
                error: err.message,
              })
              succeeded = true
              break
            }

            stepState.status = 'failed'
            stepState.finishedAt = new Date().toISOString()
            this.run.status = 'failed'
            this.run.error = err.message
            this.run.finishedAt = new Date().toISOString()
            await activityLog.append('error', 'WorkflowRunner', `Workflow failed at: ${step.name}`, {
              error: err.message,
            })
            await this.persist()
            return
          }
        }

        if (!succeeded) break

        this.run.currentStepIndex += 1
        this.updateProgress()
        await this.persist()
      }

      if (this.run.status === 'running') {
        this.run.status = 'completed'
        this.run.progress = 100
        this.run.finishedAt = new Date().toISOString()
        await activityLog.append('success', 'WorkflowRunner', `Workflow completed: ${this.run.workflowName}`)
      }

      await this.persist()
    } finally {
      this.executing = false
    }
  }

  private updateProgress(): void {
    if (!this.run || !this.workflow) return
    const total = this.workflow.steps.length
    this.run.progress = Math.round((this.run.currentStepIndex / total) * 100)
  }

  private async persist(): Promise<void> {
    await storageSet(RUN_STORAGE_KEY, this.run)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.run)
    }
  }
}

export const workflowRunner = new WorkflowRunner()
