import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

interface JsonTreePreviewProps {
  value: unknown
  className?: string
  /** Expand nested nodes by default. */
  defaultExpanded?: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function typeLabel(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array [${value.length}]`
  if (isPlainObject(value)) return `object {${Object.keys(value).length}}`
  return typeof value
}

function previewScalar(value: unknown): ReactNode {
  if (value === null) {
    return <span className="text-violet-600 dark:text-violet-400">null</span>
  }
  if (typeof value === 'string') {
    return <span className="text-foreground">{value}</span>
  }
  if (typeof value === 'number') {
    return <span className="text-sky-700 dark:text-sky-400">{String(value)}</span>
  }
  if (typeof value === 'boolean') {
    return (
      <span className="text-amber-700 dark:text-amber-400">{value ? 'true' : 'false'}</span>
    )
  }
  return <span className="text-foreground">{String(value)}</span>
}

function entriesOf(value: unknown): Array<{ key: string; child: unknown; isIndex: boolean }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      key: String(index),
      child: item,
      isIndex: true,
    }))
  }
  if (isPlainObject(value)) {
    return Object.keys(value).map((key) => ({
      key,
      child: value[key],
      isIndex: false,
    }))
  }
  return []
}

function NodeRow({
  label,
  value,
  depth,
  defaultExpanded,
}: {
  label: ReactNode
  value: unknown
  depth: number
  defaultExpanded: boolean
}) {
  const isContainer = Array.isArray(value) || isPlainObject(value)
  const [open, setOpen] = useState(defaultExpanded || depth < 2)

  if (!isContainer) {
    return (
      <div
        className="flex min-w-0 items-start gap-1.5 font-mono text-[15px] leading-7"
        style={{ paddingLeft: depth * 18 }}
      >
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">:</span>
        <span className="min-w-0 break-words">{previewScalar(value)}</span>
      </div>
    )
  }

  const summary = Array.isArray(value)
    ? `[${value.length}]`
    : `{${Object.keys(value as object).length}}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-1 rounded-md py-0.5 text-left font-mono text-[15px] leading-7 hover:bg-muted/50"
        style={{ paddingLeft: depth * 18 }}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open
        ? entriesOf(value).map((entry) => (
            <NodeRow
              key={entry.key}
              label={entry.key}
              value={entry.child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))
        : null}
    </div>
  )
}

/** DevTools-style collapsible JSON tree preview. */
export function JsonTreePreview({
  value,
  className,
  defaultExpanded = true,
}: JsonTreePreviewProps) {
  const isContainer = Array.isArray(value) || isPlainObject(value)

  return (
    <div
      className={cn(
        'overflow-auto rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm',
        className,
      )}
    >
      <p className="font-mono text-[15px] leading-7 text-muted-foreground">{typeLabel(value)}</p>
      {isContainer ? (
        entriesOf(value).map((entry) => (
          <NodeRow
            key={entry.key}
            label={entry.key}
            value={entry.child}
            depth={0}
            defaultExpanded={defaultExpanded}
          />
        ))
      ) : (
        <div className="font-mono text-[15px] leading-7">{previewScalar(value)}</div>
      )}
    </div>
  )
}
