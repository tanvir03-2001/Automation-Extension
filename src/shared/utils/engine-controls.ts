import { sendRuntimeMessage } from '@/shared/messaging/bus'
import type { ExecutionCheckpoint } from '@/planner/types/plan'

export type EnginePending = 'pause' | 'stop' | null

export function isEngineActive(checkpoint: ExecutionCheckpoint | null): boolean {
  if (!checkpoint) return false
  return (
    checkpoint.status === 'running' ||
    checkpoint.status === 'paused' ||
    checkpoint.status === 'waiting'
  )
}

function isPausedOrSettled(checkpoint: ExecutionCheckpoint | null): boolean {
  if (!checkpoint) return true
  return (
    checkpoint.status === 'paused' ||
    checkpoint.status === 'waiting' ||
    checkpoint.status === 'cancelled' ||
    checkpoint.status === 'completed' ||
    checkpoint.status === 'failed'
  )
}

async function fetchCheckpoint(): Promise<ExecutionCheckpoint | null | undefined> {
  const res = await sendRuntimeMessage<{
    ok?: boolean
    checkpoint?: ExecutionCheckpoint | null
  }>({ type: 'PLANNER_STATE' })
  return res.checkpoint
}

/** Poll until pause has taken effect (or run already ended). */
export async function waitForPauseSettled(
  setCheckpoint: (cp: ExecutionCheckpoint | null) => void,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const cp = await fetchCheckpoint()
      if (cp !== undefined) setCheckpoint(cp)
      if (isPausedOrSettled(cp ?? null)) return
    } catch {
      // keep waiting
    }
    await new Promise((r) => window.setTimeout(r, 200))
  }
}

/** Poll until force-stop has cleared an active run. */
export async function waitForStopSettled(
  setCheckpoint: (cp: ExecutionCheckpoint | null) => void,
  timeoutMs = 12_000,
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const cp = await fetchCheckpoint()
      if (cp !== undefined) setCheckpoint(cp)
      if (!isEngineActive(cp ?? null)) return
    } catch {
      // keep waiting
    }
    await new Promise((r) => window.setTimeout(r, 200))
  }
}
