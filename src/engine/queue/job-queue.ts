import { createId } from '@/shared/utils/id'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import type { QueueJob } from '@/shared/types/workflow'

const STORAGE_KEY = 'job-queue'

type QueueListener = (jobs: QueueJob[]) => void

export class JobQueue {
  private jobs: QueueJob[] = []
  private listeners = new Set<QueueListener>()
  private hydrated = false
  private processing = false
  private processor: ((job: QueueJob) => Promise<void>) | null = null

  setProcessor(processor: (job: QueueJob) => Promise<void>): void {
    this.processor = processor
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return
    this.jobs = await storageGet<QueueJob[]>(STORAGE_KEY, [])
    this.hydrated = true
  }

  async enqueue(workflowId: string, priority = 0): Promise<QueueJob> {
    await this.hydrate()

    const job: QueueJob = {
      id: createId('job'),
      workflowId,
      priority,
      createdAt: new Date().toISOString(),
      status: 'pending',
    }

    this.jobs.push(job)
    this.jobs.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))
    await this.persist()
    this.emit()
    void this.pump()
    return job
  }

  async list(): Promise<QueueJob[]> {
    await this.hydrate()
    return [...this.jobs]
  }

  async cancel(jobId: string): Promise<void> {
    await this.hydrate()
    this.jobs = this.jobs.map((job) =>
      job.id === jobId && job.status === 'pending'
        ? { ...job, status: 'cancelled' as const }
        : job,
    )
    await this.persist()
    this.emit()
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async pump(): Promise<void> {
    if (this.processing || !this.processor) return
    await this.hydrate()

    const next = this.jobs.find((job) => job.status === 'pending')
    if (!next) return

    this.processing = true
    next.status = 'active'
    await this.persist()
    this.emit()

    try {
      await this.processor(next)
      next.status = 'done'
    } catch {
      next.status = 'failed'
    }

    await this.persist()
    this.emit()
    this.processing = false
    void this.pump()
  }

  private async persist(): Promise<void> {
    await storageSet(STORAGE_KEY, this.jobs)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener([...this.jobs])
    }
  }
}

export const jobQueue = new JobQueue()
