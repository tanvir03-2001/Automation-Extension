import { useEffect, useState } from 'react'
import { Loader2, OctagonX, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { usePlannerStore } from '@/planner/store/planner-store'
import { useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'
import {
  isEngineActive,
  waitForPauseSettled,
  waitForStopSettled,
  type EnginePending,
} from '@/shared/utils/engine-controls'
import type { ExecutionCheckpoint } from '@/planner/types/plan'

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
  const [pending, setPending] = useState<EnginePending>(null)
  const active = isEngineActive(checkpoint)
  const busy = pending !== null

  // Keep local checkpoint in sync while a run is active
  useEffect(() => {
    if (!active && !busy) return
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
  }, [active, busy, setCheckpoint])

  async function pause() {
    if (busy) return
    setPending('pause')
    try {
      const res = await sendRuntimeMessage<{ checkpoint?: ExecutionCheckpoint | null }>({
        type: 'PLANNER_PAUSE',
      })
      if (res.checkpoint !== undefined) setCheckpoint(res.checkpoint)
      await waitForPauseSettled(setCheckpoint)
    } finally {
      setPending(null)
    }
  }

  async function forceStop() {
    if (busy) return
    setPending('stop')
    try {
      const res = await sendRuntimeMessage<{ checkpoint?: ExecutionCheckpoint | null }>({
        type: 'ENGINE_FORCE_STOP',
      })
      if (res.checkpoint !== undefined) setCheckpoint(res.checkpoint)
      else setCheckpoint(null)
      await waitForStopSettled(setCheckpoint)
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-1.5 rounded-2xl border border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 p-1.5 shadow-sm',
        className,
      )}
      role="group"
      aria-label={t('engine.masterControls')}
      aria-busy={busy}
    >
      <Button
        size="sm"
        variant="outline"
        className={cn(
          'rounded-xl border-amber-500/35 bg-amber-500/10 text-amber-950 shadow-none hover:bg-amber-500/20 hover:text-amber-950 dark:text-amber-100',
          compact ? 'h-8 gap-1.5 px-2 text-xs' : 'h-10 gap-2 px-2.5',
          pending === 'pause' && 'border-amber-500/50',
        )}
        disabled={busy || checkpoint?.status !== 'running'}
        onClick={() => void pause()}
        title={t('engine.pauseHint')}
      >
        {pending === 'pause' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Pause className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">
          {pending === 'pause'
            ? t('engine.pausePending')
            : compact
              ? null
              : t('common.pause')}
        </span>
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className={cn(
          'rounded-xl shadow-none',
          compact ? 'h-8 gap-1.5 px-2 text-xs' : 'h-10 gap-2 px-2.5',
        )}
        disabled={busy}
        onClick={() => void forceStop()}
        title={t('engine.forceStopHint')}
      >
        {pending === 'stop' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <OctagonX className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">
          {pending === 'stop'
            ? t('engine.stopPending')
            : compact
              ? t('engine.stopShort')
              : t('engine.forceStop')}
        </span>
      </Button>
    </div>
  )
}
