import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { getJsonAtPath } from '@/planner/engine/custom-section-paths'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'

function isLeaf(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function joinPath(base: string, segment: string): string {
  if (!base) return segment
  return `${base}.${segment}`
}

function previewValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const trimmed = value.length > 48 ? `${value.slice(0, 48)}…` : value
    return JSON.stringify(trimmed)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).length} keys}`
  }
  return String(value)
}

export type JsonPathPickerProps = {
  root: unknown
  path: string
  onChange: (path: string) => void
  /** Shown above the picker (e.g. dataset / loop item name). */
  rootLabel?: string
  className?: string
}

/**
 * Visual drill-down to a leaf JSON value. Stores a dotted path relative to root
 * (e.g. `story.title`). Empty path means the root itself is a leaf.
 */
export function JsonPathPicker({
  root,
  path,
  onChange,
  rootLabel,
  className,
}: JsonPathPickerProps) {
  const t = useT()
  const segments = useMemo(
    () => (path.trim() ? path.split('.').filter(Boolean) : []),
    [path],
  )

  const current = useMemo(() => {
    if (!segments.length) return root
    return getJsonAtPath(root, segments.join('.'))
  }, [root, segments])

  const crumbs = useMemo(() => {
    const items: Array<{ label: string; path: string }> = [
      { label: rootLabel || t('typeText.pathRoot'), path: '' },
    ]
    let built = ''
    for (const segment of segments) {
      built = joinPath(built, segment)
      items.push({ label: segment, path: built })
    }
    return items
  }, [rootLabel, segments, t])

  if (root === undefined) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        {t('typeText.pathNoData')}
      </p>
    )
  }

  if (isLeaf(root) && !path) {
    return (
      <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
        <p className="text-[11px] text-muted-foreground">{t('typeText.pathLeafRoot')}</p>
        <Button
          type="button"
          size="sm"
          className="w-full rounded-xl"
          onClick={() => onChange('')}
        >
          {t('typeText.pathSelectValue')}: {previewValue(root)}
        </Button>
      </div>
    )
  }

  const entries: Array<{ key: string; value: unknown; hint?: string }> = []
  if (Array.isArray(current)) {
    if (current.length === 0) {
      return (
        <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
          <PathBreadcrumb crumbs={crumbs} onNavigate={onChange} />
          <p className="text-[11px] text-muted-foreground">{t('typeText.pathEmptyArray')}</p>
        </div>
      )
    }
    const queueable = current.every(
      (item) =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean' ||
        (item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          (typeof (item as Record<string, unknown>).title === 'string' ||
            typeof (item as Record<string, unknown>).text === 'string' ||
            typeof (item as Record<string, unknown>).name === 'string')),
    )
    if (queueable) {
      return (
        <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
          <PathBreadcrumb crumbs={crumbs} onNavigate={onChange} />
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('typeText.pathSelected')}
            </p>
            <p className="mt-1 break-words font-mono text-[11px]">{path || '(root list)'}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('typeText.pathQueueHint', { count: String(current.length) })}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full rounded-xl"
            onClick={() => onChange(path)}
          >
            {t('typeText.pathUseList')}
          </Button>
          {/* Still allow drilling into index 0 object fields when items are objects */}
          {current[0] && typeof current[0] === 'object' && !Array.isArray(current[0]) ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs hover:bg-muted/70"
              onClick={() => onChange(joinPath(path, '0'))}
            >
              <span className="font-semibold">{t('typeText.pathCurrentItem')}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      )
    }
    // Prefer drilling into sample index 0 as “current item fields” for object arrays
    const sample = current[0]
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      entries.push({
        key: '0',
        value: sample,
        hint: t('typeText.pathCurrentItem'),
      })
    }
    current.forEach((item, index) => {
      if (index === 0 && sample && typeof sample === 'object' && !Array.isArray(sample)) {
        return // already offered as current item
      }
      entries.push({
        key: String(index),
        value: item,
        hint: isLeaf(item) ? undefined : Array.isArray(item) ? 'array' : 'object',
      })
    })
  } else if (current && typeof current === 'object') {
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      entries.push({ key, value })
    }
  } else if (isLeaf(current)) {
    return (
      <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
        <PathBreadcrumb crumbs={crumbs} onNavigate={onChange} />
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('typeText.pathSelected')}
          </p>
          <p className="mt-1 break-words font-mono text-[11px]">{path || '(root)'}</p>
          <p className="mt-1 break-words text-[11px] text-muted-foreground">
            {previewValue(current)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => onChange(segments.slice(0, -1).join('.'))}
        >
          {t('typeText.pathBack')}
        </Button>
      </div>
    )
  } else {
    return (
      <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
        <PathBreadcrumb crumbs={crumbs} onNavigate={onChange} />
        <p className="text-[11px] text-muted-foreground">{t('typeText.pathNoData')}</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2 rounded-xl border border-border bg-background p-3', className)}>
      <PathBreadcrumb crumbs={crumbs} onNavigate={onChange} />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('typeText.pathKeys')}
      </p>
      <ul className="max-h-52 space-y-1 overflow-y-auto">
        {entries.map(({ key, value, hint }) => {
          const nextPath = joinPath(path, key)
          const leaf = isLeaf(value)
          return (
            <li key={key}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/70',
                  leaf ? 'border border-primary/30 bg-primary/5' : 'border border-transparent',
                )}
                onClick={() => onChange(nextPath)}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">{key}</span>
                  {hint ? (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">({hint})</span>
                  ) : null}
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {previewValue(value)}
                  </span>
                </span>
                {leaf ? (
                  <span className="shrink-0 text-[10px] font-semibold text-primary">
                    {t('typeText.pathSelect')}
                  </span>
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {path ? (
        <p className="break-all font-mono text-[10px] text-muted-foreground">
          {t('typeText.pathLabel')}: {path}
        </p>
      ) : null}
    </div>
  )
}

function PathBreadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: Array<{ label: string; path: string }>
  onNavigate: (path: string) => void
}) {
  return (
    <nav className="flex flex-wrap items-center gap-0.5 text-[11px]">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <span key={`${crumb.path}-${index}`} className="flex items-center gap-0.5">
            {index > 0 ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : null}
            {isLast ? (
              <span className="font-semibold text-foreground">{crumb.label}</span>
            ) : (
              <button
                type="button"
                className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onNavigate(crumb.path)}
              >
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/** Preview a leaf (or stringify) at path for the inspector. */
export function previewJsonPath(root: unknown, path: string): string {
  const value = path.trim() ? getJsonAtPath(root, path) : root
  if (value === undefined) return ''
  if (isLeaf(value)) {
    if (value === null) return ''
    return String(value)
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
