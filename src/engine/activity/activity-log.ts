import { createId } from '@/shared/utils/id'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import type { ActivityLogEntry } from '@/shared/types/workflow'

const STORAGE_KEY = 'activity-log'
const MAX_ENTRIES = 500

type Listener = (entries: ActivityLogEntry[]) => void

export class ActivityLog {
  private entries: ActivityLogEntry[] = []
  private listeners = new Set<Listener>()
  private hydrated = false

  async hydrate(): Promise<void> {
    if (this.hydrated) return
    this.entries = await storageGet<ActivityLogEntry[]>(STORAGE_KEY, [])
    this.hydrated = true
  }

  async append(
    level: ActivityLogEntry['level'],
    source: string,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<ActivityLogEntry> {
    await this.hydrate()

    const entry: ActivityLogEntry = {
      id: createId('log'),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      meta,
    }

    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES)
    await storageSet(STORAGE_KEY, this.entries)
    this.emit()
    return entry
  }

  async list(limit = 100): Promise<ActivityLogEntry[]> {
    await this.hydrate()
    return this.entries.slice(0, limit)
  }

  async clear(): Promise<void> {
    this.entries = []
    await storageSet(STORAGE_KEY, this.entries)
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.entries)
    }
  }
}

export const activityLog = new ActivityLog()
