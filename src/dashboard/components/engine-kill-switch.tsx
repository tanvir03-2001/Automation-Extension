import { useEffect, useState } from 'react'
import { OctagonX, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { usePlannerStore } from '@/planner/store/planner-store'
import { useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'
import type { ExecutionCheckpoint } from '@/planner/types/plan'

function isEngineActive(checkpoint: ExecutionCheckpoint | null): boolean {
  if (!checkpoint) return false
  return (
    checkpoint.status === 'running' ||
    checkpoint.status === 'paused' ||
    checkpoint.status === 'waiting'
  )
}

/**
 * Always-available master Pause / Force Stop for the automation engine.
 * Works from any dashboard view (including when the planner builder hides the sidebar).
 */
export function EngineKillSwitch({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const t = useT()
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const setCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const [busy, setBusy] = useState(false)
  const active = isEngineActive(checkpoint)

  // Keep local checkpoint in sync while a run is active
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await sendRuntimeMessage<{
          ok?: boolean
          checkpoint?: ExecutionCheckpoint | null
        }>({ type: 'PLANNER_STATE' })
        if (!cancelled && res.checkpoint !== undefined) {
          setCheckpoint(res.checkpoint)
        }
      } catch {
        // ignore poll errors
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 800)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active, setCheckpoint])

  async function pause() {
    setBusy(true)
    try {
      const res = await sendRuntimeMessage<{ checkpoint?: ExecutionCheckpoint | null }>({
        type: 'PLANNER_PAUSE',
      })
      if (res.checkpoint !== undefined) setCheckpoint(res.checkpoint)
    } finally {
      setBusy(false)
    }
  }

  async function forceStop() {
    setBusy(true)
    try {
      const res = await sendRuntimeMessage<{ checkpoint?: ExecutionCheckpoint | null }>({
        type: 'ENGINE_FORCE_STOP',
      })
      if (res.checkpoint !== undefined) setCheckpoint(res.checkpoint)
      else setCheckpoint(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-2xl border border-destructive/40 bg-destructive/10 p-1',
        compact ? 'shadow-sm' : 'shadow-md',
        className,
      )}
      role="group"
      aria-label={t('engine.masterControls')}
    >
      <Button
        size="sm"
        variant="outline"
        className={cn(
          'rounded-xl border-border bg-background',
          compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3',
        )}
        disabled={busy || checkpoint?.status !== 'running'}
        onClick={() => void pause()}
        title={t('engine.pauseHint')}
      >
        <Pause className="h-3.5 w-3.5" />
        {compact ? null : t('common.pause')}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className={cn('rounded-xl', compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3')}
        disabled={busy}
        onClick={() => void forceStop()}
        title={t('engine.forceStopHint')}
      >
        <OctagonX className="h-3.5 w-3.5" />
        {compact ? t('engine.stopShort') : t('engine.forceStop')}
      </Button>
    </div>
  )
}
