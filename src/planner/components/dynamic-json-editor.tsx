import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/shared/utils/cn'

type JsonKind = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'

function kindOf(value: unknown): JsonKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

function emptyOf(kind: JsonKind): unknown {
  switch (kind) {
    case 'array':
      return []
    case 'object':
      return {}
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'null':
      return null
    default:
      return ''
  }
}

function uniqueKey(record: Record<string, unknown>, base = 'key'): string {
  if (!(base in record)) return base
  let i = 1
  while (`${base}_${i}` in record) i += 1
  return `${base}_${i}`
}

interface DynamicJsonEditorProps {
  value: unknown
  onChange: (next: unknown) => void
  depth?: number
  className?: string
}

/** Recursive JSON builder — property names are user-typed, never hardcoded. */
export function DynamicJsonEditor({
  value,
  onChange,
  depth = 0,
  className,
}: DynamicJsonEditorProps) {
  const kind = kindOf(value)

  if (kind === 'array') {
    const list = value as unknown[]
    return (
      <div
        className={cn(
          'space-y-2 rounded-xl border border-border/80 bg-background/60 p-2.5',
          className,
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          List · {list.length} item{list.length === 1 ? '' : 's'}
        </p>
        {list.map((item, index) => (
          <div
            key={index}
            className="space-y-1.5 rounded-lg border border-dashed border-border px-2 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">[{index}]</span>
              <div className="flex items-center gap-1">
                <KindSelect
                  value={kindOf(item)}
                  onChange={(nextKind) => {
                    const next = [...list]
                    next[index] = emptyOf(nextKind)
                    onChange(next)
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-lg p-0 text-rose-500"
                  onClick={() => onChange(list.filter((_, i) => i !== index))}
                  title="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <DynamicJsonEditor
              value={item}
              depth={depth + 1}
              onChange={(child) => {
                const next = [...list]
                next[index] = child
                onChange(next)
              }}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => onChange([...list, ''])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => onChange([...list, {}])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add object
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => onChange([...list, []])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add list
          </Button>
        </div>
      </div>
    )
  }

  if (kind === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.entries(record)
    return (
      <div
        className={cn(
          'space-y-2 rounded-xl border border-border/80 bg-background/60 p-2.5',
          className,
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Object · {entries.length} propert{entries.length === 1 ? 'y' : 'ies'}
        </p>
        {entries.map(([key, child]) => (
          <ObjectPropertyRow
            key={key}
            propertyKey={key}
            child={child}
            record={record}
            depth={depth}
            onChange={onChange}
          />
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              const key = uniqueKey(record, 'key')
              onChange({ ...record, [key]: '' })
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add property
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              const key = uniqueKey(record, 'list')
              onChange({ ...record, [key]: [] })
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add list
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              const key = uniqueKey(record, 'child')
              onChange({ ...record, [key]: {} })
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add child object
          </Button>
        </div>
      </div>
    )
  }

  if (kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {value ? 'true' : 'false'}
      </label>
    )
  }

  if (kind === 'number') {
    return (
      <Input
        type="number"
        className="h-8 rounded-lg font-mono text-xs"
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (kind === 'null') {
    return <p className="text-xs text-muted-foreground">null</p>
  }

  return (
    <Input
      className="h-8 rounded-lg text-xs"
      value={String(value ?? '')}
      placeholder="value"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ObjectPropertyRow({
  propertyKey,
  child,
  record,
  depth,
  onChange,
}: {
  propertyKey: string
  child: unknown
  record: Record<string, unknown>
  depth: number
  onChange: (next: unknown) => void
}) {
  const [draftKey, setDraftKey] = useState(propertyKey)

  function commitKey() {
    const nextKey = draftKey.trim()
    if (!nextKey || nextKey === propertyKey) {
      setDraftKey(propertyKey)
      return
    }
    if (nextKey in record) {
      setDraftKey(propertyKey)
      return
    }
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      next[k === propertyKey ? nextKey : k] = v
    }
    onChange(next)
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border px-2 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          className="h-8 min-w-[7rem] flex-1 rounded-lg font-mono text-xs"
          value={draftKey}
          placeholder="property name"
          onChange={(event) => setDraftKey(event.target.value)}
          onBlur={commitKey}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitKey()
            }
          }}
        />
        <KindSelect
          value={kindOf(child)}
          onChange={(nextKind) => {
            onChange({ ...record, [propertyKey]: emptyOf(nextKind) })
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 rounded-lg p-0 text-rose-500"
          onClick={() => {
            const next = { ...record }
            delete next[propertyKey]
            onChange(next)
          }}
          title="Remove property"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <DynamicJsonEditor
        value={child}
        depth={depth + 1}
        onChange={(nextChild) => onChange({ ...record, [propertyKey]: nextChild })}
      />
    </div>
  )
}

function KindSelect({
  value,
  onChange,
}: {
  value: JsonKind
  onChange: (kind: JsonKind) => void
}) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-background px-1.5 text-[11px] text-foreground outline-none ring-ring focus:ring-2"
      value={value}
      onChange={(event) => onChange(event.target.value as JsonKind)}
      title="Value type"
    >
      <option value="string">text</option>
      <option value="number">number</option>
      <option value="boolean">boolean</option>
      <option value="object">object</option>
      <option value="array">list</option>
      <option value="null">null</option>
    </select>
  )
}
