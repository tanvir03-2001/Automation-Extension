import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Eraser,
  Info,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { useDashboardStore } from '@/stores/dashboard-store'
import { clearLogs, fetchLogs, reloadExtension } from '@/dashboard/api/extension-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/cn'

const levelVariant = {
  info: 'secondary',
  warn: 'warning',
  error: 'destructive',
  success: 'success',
  debug: 'outline',
} as const

const levelIcon = {
  info: Info,
  warn: AlertTriangle,
  error: CircleAlert,
  success: CheckCircle2,
  debug: Info,
} as const

const levelRing = {
  info: 'border-border bg-card',
  warn: 'border-amber-500/30 bg-amber-500/[0.06]',
  error: 'border-rose-500/30 bg-rose-500/[0.07]',
  success: 'border-emerald-500/30 bg-emerald-500/[0.06]',
  debug: 'border-border bg-muted/30',
} as const

export function ActivityView() {
  const logs = useDashboardStore((s) => s.logs)
  const setLogs = useDashboardStore((s) => s.setLogs)
  const [filter, setFilter] = useState<'all' | 'error' | 'success' | 'info'>('all')
  const [busy, setBusy] = useState<'refresh' | 'clear' | 'reload' | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return logs
    if (filter === 'error') return logs.filter((log) => log.level === 'error' || log.level === 'warn')
    if (filter === 'success') return logs.filter((log) => log.level === 'success')
    return logs.filter((log) => log.level === 'info' || log.level === 'debug')
  }, [logs, filter])

  async function onRefresh() {
    setBusy('refresh')
    try {
      setLogs(await fetchLogs())
    } finally {
      setBusy(null)
    }
  }

  async function onClear() {
    setBusy('clear')
    try {
      await clearLogs()
      setLogs([])
    } finally {
      setBusy(null)
    }
  }

  async function onReload() {
    setBusy('reload')
    try {
      await reloadExtension()
    } catch {
      /* page may unload */
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Durable audit trail for runs, retries, downloads, and module actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={busy === 'refresh'}
            onClick={() => void onRefresh()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy === 'refresh' && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={busy === 'clear' || logs.length === 0}
            onClick={() => void onClear()}
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear log
          </Button>
          <Button
            size="sm"
            className="rounded-xl"
            disabled={busy === 'reload'}
            onClick={() => void onReload()}
          >
            <RotateCcw className={cn('h-3.5 w-3.5', busy === 'reload' && 'animate-spin')} />
            Reload extension
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'All'],
            ['error', 'Errors'],
            ['success', 'Success'],
            ['info', 'Info'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filter === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        <Badge variant="secondary" className="ml-1">
          {filtered.length} shown
        </Badge>
      </div>

      <div className="space-y-2">
        {filtered.map((log, index) => {
          const Icon = levelIcon[log.level] ?? Info
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.012, 0.2) }}
              className={cn(
                'relative overflow-hidden rounded-2xl border px-4 py-3',
                levelRing[log.level],
              )}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 w-1',
                  log.level === 'error' && 'bg-rose-500',
                  log.level === 'warn' && 'bg-amber-500',
                  log.level === 'success' && 'bg-emerald-500',
                  (log.level === 'info' || log.level === 'debug') && 'bg-slate-400/70',
                )}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pl-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/70">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <Badge variant={levelVariant[log.level]}>{log.level}</Badge>
                  <span className="text-sm font-medium">{log.source}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 pl-1 text-sm leading-relaxed text-muted-foreground">
                {log.message}
              </p>
            </motion.div>
          )
        })}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No log entries for this filter.
          </div>
        ) : null}
      </div>
    </div>
  )
}
