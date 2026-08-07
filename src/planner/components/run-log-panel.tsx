import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Eraser,
  Info,
  RefreshCw,
  RotateCcw,
  ScrollText,
  X,
} from 'lucide-react'
import { usePlannerStore } from '@/planner/store/planner-store'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/shared/utils/cn'

interface ActivityEntry {
  id: string
  level: 'info' | 'warn' | 'error' | 'success' | 'debug'
  source: string
  message: string
  timestamp: string
}

type FilterTab = 'all' | 'errors' | 'steps'

const LEVEL_STYLE: Record<
  ActivityEntry['level'],
  { icon: typeof Info; badge: 'destructive' | 'warning' | 'success' | 'secondary' | 'outline'; ring: string }
> = {
  error: {
    icon: CircleAlert,
    badge: 'destructive',
    ring: 'border-rose-500/35 bg-rose-500/8',
  },
  warn: {
    icon: AlertTriangle,
    badge: 'warning',
    ring: 'border-amber-500/35 bg-amber-500/8',
  },
  success: {
    icon: CheckCircle2,
    badge: 'success',
    ring: 'border-emerald-500/30 bg-emerald-500/8',
  },
  info: {
    icon: Info,
    badge: 'secondary',
    ring: 'border-border bg-background/80',
  },
  debug: {
    icon: Info,
    badge: 'outline',
    ring: 'border-border bg-muted/40',
  },
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return value
  }
}

export function RunLogPanel() {
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const setCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const workflow = usePlannerStore((s) =>
    s.workflows.find((wf) => wf.id === s.selectedWorkflowId),
  )
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')

  const failedSteps = useMemo(() => {
    const history = checkpoint?.history ?? []
    return [...history]
      .reverse()
      .filter((item) => item.status === 'failed' || item.status === 'timeout' || item.error)
      .slice(0, 20)
  }, [checkpoint?.history])

  const errorCount =
    failedSteps.length + logs.filter((log) => log.level === 'error' || log.level === 'warn').length

  async function refreshLogs() {
    setLoading(true)
    try {
      const response = await sendRuntimeMessage<{ ok: boolean; logs?: ActivityEntry[] }>({
        type: 'ACTIVITY_LIST',
      })
      setLogs((response.logs ?? []).slice(0, 80))
    } finally {
      setLoading(false)
    }
  }

  async function clearLogs() {
    setClearing(true)
    try {
      await sendRuntimeMessage({ type: 'ACTIVITY_CLEAR' })
      setLogs([])
      setCheckpoint(null)
      setFilter('all')
    } finally {
      setClearing(false)
    }
  }

  async function reloadExtension() {
    setReloading(true)
    try {
      await sendRuntimeMessage({ type: 'EXTENSION_RELOAD' })
    } catch {
      // Page may unload during reload
    }
  }

  useEffect(() => {
    if (open) void refreshLogs()
  }, [open, checkpoint?.status, checkpoint?.updatedAt])

  const nodeLabel = (nodeId: string) =>
    workflow?.nodes.find((node) => node.id === nodeId)?.data.label ?? nodeId

  const filteredLogs = useMemo(() => {
    if (filter === 'errors') {
      return logs.filter((log) => log.level === 'error' || log.level === 'warn')
    }
    if (filter === 'steps') return []
    return logs
  }, [logs, filter])

  const canClear = logs.length > 0 || failedSteps.length > 0 || Boolean(checkpoint)

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-3">
        <div className="pointer-events-auto w-full max-w-3xl">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              'flex w-full items-center justify-between rounded-xl border px-3 py-1.5 text-left text-xs shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition',
              checkpoint?.status === 'failed'
                ? 'border-rose-500/45 bg-card/95 text-foreground'
                : 'border-border/80 bg-card/95 text-foreground hover:border-primary/40',
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-lg',
                  checkpoint?.status === 'failed'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-primary/15 text-primary',
                )}
              >
                <ScrollText className="h-3.5 w-3.5" />
              </span>
              <span>
                Run log
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {checkpoint?.status ? `· ${checkpoint.status}` : '· idle'}
                </span>
              </span>
              {errorCount > 0 ? (
                <Badge variant="destructive">{errorCount} issue</Badge>
              ) : (
                <Badge variant="secondary">{logs.length || failedSteps.length} entries</Badge>
              )}
            </span>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>

          {open ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/80 bg-card/98 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-foreground">Activity & errors</p>
                  <p className="text-[11px] text-muted-foreground">
                    Live step failures + durable activity trail
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-2.5 text-xs"
                    disabled={loading}
                    onClick={() => void refreshLogs()}
                    title="Refresh"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-2.5 text-xs"
                    disabled={clearing || !canClear}
                    onClick={() => void clearLogs()}
                    title="Clear all logs and failed-run history"
                  >
                    <Eraser className={cn('h-3.5 w-3.5', clearing && 'animate-pulse')} />
                    Clear all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg px-2.5 text-xs"
                    disabled={reloading}
                    onClick={() => void reloadExtension()}
                    title="Reload extension"
                  >
                    <RotateCcw className={cn('h-3.5 w-3.5', reloading && 'animate-spin')} />
                    Reload ext
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-2"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-1 border-b border-border/60 px-3 py-2">
                {(
                  [
                    ['all', 'All'],
                    ['errors', 'Errors'],
                    ['steps', 'Failed steps'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                      filter === id
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[42vh] space-y-3 overflow-y-auto p-3">
                {(filter === 'all' || filter === 'steps') && (
                  <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Failed steps (this run)
                    </p>
                    {failedSteps.length === 0 ? (
                      <EmptyState text="No failed steps in the current run." />
                    ) : (
                      <div className="space-y-2">
                        {failedSteps.map((item, index) => (
                          <article
                            key={`${item.nodeId}-${item.at}-${index}`}
                            className="relative overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2.5"
                          >
                            <div className="absolute inset-y-0 left-0 w-1 bg-rose-500/80" />
                            <div className="flex flex-wrap items-center gap-2 pl-1">
                              <Badge variant="destructive">{item.status}</Badge>
                              <span className="text-xs font-semibold text-foreground">
                                {nodeLabel(item.nodeId)}
                              </span>
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                {formatTime(item.at)}
                              </span>
                            </div>
                            <p className="mt-1.5 break-words pl-1 text-xs leading-relaxed text-foreground/90">
                              {item.error ?? 'No error message stored'}
                            </p>
                            <p className="mt-1 pl-1 font-mono text-[10px] text-muted-foreground">
                              {item.nodeId}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(filter === 'all' || filter === 'errors') && (
                  <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Activity trail
                    </p>
                    {filteredLogs.length === 0 ? (
                      <EmptyState text="No activity yet for this filter." />
                    ) : (
                      <div className="relative space-y-2 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border/80">
                        {filteredLogs.map((log) => {
                          const style = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info
                          const Icon = style.icon
                          return (
                            <article
                              key={log.id}
                              className={cn(
                                'relative ml-0 rounded-xl border px-3 py-2.5 pl-10',
                                style.ring,
                              )}
                            >
                              <span className="absolute left-2 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                                <Icon className="h-3 w-3" />
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={style.badge}>{log.level}</Badge>
                                <span className="text-xs font-medium text-foreground">
                                  {log.source}
                                </span>
                                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                  {formatTime(log.timestamp)}
                                </span>
                              </div>
                              <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">
                                {log.message}
                              </p>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}
