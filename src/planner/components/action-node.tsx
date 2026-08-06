import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Loader2 } from 'lucide-react'
import { getActionById } from '@/planner/actions/catalog'
import { ActionIcon } from '@/planner/components/action-icons'
import { useNodeRunVisual, type NodeRunVisual } from '@/planner/hooks/use-node-run-visual'
import type { PlannerNodeData } from '@/planner/types/plan'
import { cn } from '@/shared/utils/cn'

type FlowActionNode = Node<PlannerNodeData, 'action' | 'start' | 'end'>

const RUN_BADGE: Record<
  Exclude<NodeRunVisual, 'idle'>,
  { text: string; className: string }
> = {
  running: {
    text: 'Running',
    className: 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.55)]',
  },
  paused: {
    text: 'Paused',
    className: 'bg-amber-500 text-white',
  },
  waiting: {
    text: 'Waiting',
    className: 'bg-sky-500 text-white',
  },
  success: {
    text: 'Done',
    className: 'bg-emerald-600/90 text-white',
  },
  failed: {
    text: 'Failed',
    className: 'bg-rose-500 text-white',
  },
  skipped: {
    text: 'Skipped',
    className: 'bg-slate-500 text-white',
  },
}

export const ActionFlowNode = memo(function ActionFlowNode({
  id,
  data,
  selected,
}: NodeProps<FlowActionNode>) {
  const action = getActionById(data.actionId)
  const runVisual = useNodeRunVisual(id)
  const isIfBranch =
    data.actionId === 'conditions.if' || data.actionId === 'element.if_visible'
  const isSwitch = data.actionId === 'conditions.switch'
  const switchCases = String(data.params?.cases ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const switchBranches = [...switchCases, 'default']
  const isStart = data.actionId === 'flow.start'
  const isEnd = data.actionId === 'flow.end'
  const accent = data.color ?? action?.color ?? '#0f766e'
  const isActive = runVisual === 'running' || runVisual === 'paused' || runVisual === 'waiting'
  const badge = runVisual === 'idle' ? null : RUN_BADGE[runVisual]

  return (
    <div
      className={cn(
        'group relative w-[220px] rounded-2xl border bg-card text-card-foreground shadow-[0_8px_28px_rgba(15,23,42,0.08)] transition-all duration-200 dark:shadow-[0_8px_28px_rgba(0,0,0,0.35)]',
        selected && !isActive
          ? 'border-transparent ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'border-border',
        !isActive && !selected && 'hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.12)]',
        runVisual === 'running' &&
          'ae-node-running border-emerald-400/80 ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-background',
        runVisual === 'paused' &&
          'border-amber-400/80 ring-2 ring-amber-400/60 ring-offset-2 ring-offset-background',
        runVisual === 'waiting' &&
          'border-sky-400/80 ring-2 ring-sky-400/60 ring-offset-2 ring-offset-background',
        runVisual === 'success' && 'border-emerald-500/40',
        runVisual === 'failed' &&
          'border-rose-500/70 ring-2 ring-rose-500/50 ring-offset-2 ring-offset-background',
        !data.enabled && 'opacity-45 grayscale',
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
      />

      {badge ? (
        <div
          className={cn(
            'absolute -right-2 -top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            badge.className,
          )}
        >
          {runVisual === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {badge.text}
        </div>
      ) : null}

      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!-left-1.5 !h-3 !w-3 !border-2 !border-card !bg-slate-400"
        />
      )}

      <div className="flex items-start gap-3 px-3.5 pb-3 pt-4">
        <div
          className={cn(
            'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm',
            isActive && 'animate-pulse',
          )}
          style={{ background: accent }}
        >
          <ActionIcon name={action?.icon} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {action?.category ?? 'action'}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
          {!data.collapsed && action?.description ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {action.description}
            </p>
          ) : null}
          {isActive ? (
            <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {runVisual === 'paused'
                ? 'Paused on this step'
                : runVisual === 'waiting'
                  ? 'Waiting here…'
                  : 'Working on this step…'}
            </p>
          ) : null}
        </div>
      </div>

      {isIfBranch ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: '38%' }}
            className="!-right-1.5 !h-3 !w-3 !border-2 !border-card !bg-emerald-500"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: '72%' }}
            className="!-right-1.5 !h-3 !w-3 !border-2 !border-card !bg-rose-500"
          />
          <div className="flex justify-between border-t border-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="text-emerald-500">true</span>
            <span className="text-rose-400">false</span>
          </div>
        </>
      ) : isSwitch ? (
        <>
          {switchBranches.map((branch, index) => {
            const top = ((index + 1) / (switchBranches.length + 1)) * 100
            const isDefault = branch === 'default'
            return (
              <Handle
                key={branch}
                id={branch}
                type="source"
                position={Position.Right}
                style={{ top: `${top}%` }}
                className={cn(
                  '!-right-1.5 !h-3 !w-3 !border-2 !border-card',
                  isDefault ? '!bg-slate-400' : '!bg-sky-500',
                )}
                title={branch}
              />
            )
          })}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
            {switchBranches.map((branch) => (
              <span
                key={branch}
                className={branch === 'default' ? 'text-slate-400' : 'text-sky-400'}
              >
                {branch}
              </span>
            ))}
          </div>
        </>
      ) : !isEnd ? (
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!-right-1.5 !h-3 !w-3 !border-2 !border-card !bg-primary"
        />
      ) : null}
    </div>
  )
})
