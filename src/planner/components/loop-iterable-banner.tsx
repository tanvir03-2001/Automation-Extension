import { Repeat } from 'lucide-react'
import type { LoopScopeFrame } from '@/planner/engine/loop-scope'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/shared/i18n/use-t'

type Props = {
  /** Innermost → outermost stack; UI shows innermost (last) by default, lists nested if >1. */
  stack: LoopScopeFrame[]
}

function sampleKeys(sampleItem: unknown): string {
  if (!sampleItem || typeof sampleItem !== 'object' || Array.isArray(sampleItem)) return ''
  return Object.keys(sampleItem as object).slice(0, 8).join(', ')
}

export function LoopIterableBanner({ stack }: Props) {
  const t = useT()
  if (!stack.length) return null

  const frame = stack[stack.length - 1]!
  const keys = sampleKeys(frame.sampleItem)

  return (
    <div className="space-y-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 border-orange-500/40 bg-background/80 text-foreground">
          <Repeat className="h-3 w-3" />
          {t('loop.iterableMode')}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{frame.label}</span>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-foreground">{t('loop.iteratesOver')}</span>
        <div className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
          {frame.collectionLabel}
        </div>
      </label>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {t('loop.itemVar')}:{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">{`\${${frame.itemVariable}}`}</code>
        </span>
        <span>
          {t('loop.indexVar')}:{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">{`\${${frame.indexVariable}}`}</code>
        </span>
      </div>

      {keys ? (
        <p className="text-[11px] text-muted-foreground">
          {t('loop.sampleFields')}:{' '}
          <span className="font-mono text-foreground">{keys}</span>
        </p>
      ) : null}

      {stack.length > 1 ? (
        <p className="text-[10px] text-muted-foreground">
          {t('loop.nestedCount', { count: String(stack.length) })}
        </p>
      ) : null}
    </div>
  )
}
