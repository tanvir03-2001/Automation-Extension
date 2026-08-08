import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/shared/utils/cn'
import {
  KEYBOARD_KEY_GROUPS,
  MAX_CHORD_KEYS,
  MODIFIER_KEYS,
  chordToParam,
  formatChord,
  formatKeyLabel,
  normalizeChord,
  parseKeyChord,
} from '@/planner/data/keyboard-keys'

interface KeyPressFieldsProps {
  /** Stored as "Control+Enter" or single key */
  value: string
  onChange: (chord: string, keys: string[]) => void
  allowChord?: boolean
}

export function KeyPressFields({ value, onChange, allowChord = true }: KeyPressFieldsProps) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => normalizeChord(parseKeyChord(value)), [value])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return KEYBOARD_KEY_GROUPS
    return KEYBOARD_KEY_GROUPS.map((group) => ({
      ...group,
      keys: group.keys.filter((key) => {
        const hay = `${key.label} ${key.name ?? ''} ${key.value}`.toLowerCase()
        return hay.includes(q)
      }),
    })).filter((group) => group.keys.length > 0)
  }, [query])

  function commit(next: string[]) {
    const chord = normalizeChord(next)
    onChange(chordToParam(chord), chord)
  }

  function toggleKey(keyValue: string) {
    if (selected.includes(keyValue)) {
      commit(selected.filter((k) => k !== keyValue))
      return
    }
    if (!allowChord) {
      commit([keyValue])
      return
    }
    // Replacing a non-modifier when already at max: drop previous main keys
    if (selected.length >= MAX_CHORD_KEYS) {
      if (MODIFIER_KEYS.has(keyValue)) {
        commit([...selected.filter((k) => MODIFIER_KEYS.has(k)), keyValue].slice(0, MAX_CHORD_KEYS))
        return
      }
      commit([...selected.filter((k) => MODIFIER_KEYS.has(k)), keyValue])
      return
    }
    // Only one non-modifier "main" key — swap if adding another letter/special
    if (!MODIFIER_KEYS.has(keyValue)) {
      const mods = selected.filter((k) => MODIFIER_KEYS.has(k))
      commit([...mods, keyValue])
      return
    }
    commit([...selected, keyValue])
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Selected keys</p>
        <div className="flex min-h-[52px] flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5">
          {selected.length === 0 ? (
            <span className="text-xs text-muted-foreground">Pick keys below…</span>
          ) : (
            selected.map((key, index) => (
              <span key={key} className="inline-flex items-center gap-1">
                {index > 0 ? (
                  <span className="px-0.5 text-xs font-semibold text-muted-foreground">+</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleKey(key)}
                  className="ae-keycap inline-flex min-w-[2.25rem] items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-bold tracking-wide text-foreground shadow-sm hover:border-rose-400/60 hover:text-rose-500"
                  title="Remove"
                >
                  {formatKeyLabel(key)}
                </button>
              </span>
            ))
          )}
        </div>
        {selected.length > 0 ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Will press: <span className="font-semibold text-foreground">{formatChord(selected)}</span>
            {allowChord ? ' · pick modifiers + one main key' : ''}
          </p>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search keys… Enter, Ctrl, A, F5"
          className="h-9 pl-8 pr-8"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setQuery('')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="max-h-[340px] space-y-3 overflow-y-auto pr-0.5">
        {filteredGroups.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.title}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.keys.map((key) => {
                const active = selected.includes(key.value)
                return (
                  <button
                    key={key.value === ' ' ? 'Space' : key.value}
                    type="button"
                    title={key.name ?? key.label}
                    onClick={() => toggleKey(key.value)}
                    className={cn(
                      'inline-flex min-w-[2rem] items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/60',
                    )}
                  >
                    {key.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={selected.length === 0}
          onClick={() => commit([])}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}
