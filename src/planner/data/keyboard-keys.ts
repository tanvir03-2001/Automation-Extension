/** Catalog of pressable keys for Press Key / Shortcut actions. */

export interface KeyOption {
  /** KeyboardEvent.key value */
  value: string
  /** Short UI label on keycaps */
  label: string
  /** Optional longer name in the picker list */
  name?: string
}

export interface KeyGroup {
  id: string
  title: string
  keys: KeyOption[]
}

export const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

export const KEYBOARD_KEY_GROUPS: KeyGroup[] = [
  {
    id: 'modifiers',
    title: 'Modifiers (hold with another key)',
    keys: [
      { value: 'Control', label: 'Ctrl', name: 'Control' },
      { value: 'Alt', label: 'Alt', name: 'Alt / Option' },
      { value: 'Shift', label: 'Shift', name: 'Shift' },
      { value: 'Meta', label: 'Win', name: 'Meta / Windows / ⌘' },
    ],
  },
  {
    id: 'special',
    title: 'Special',
    keys: [
      { value: 'Enter', label: 'Enter' },
      { value: 'Escape', label: 'Esc', name: 'Escape' },
      { value: 'Tab', label: 'Tab' },
      { value: ' ', label: 'Space', name: 'Space' },
      { value: 'Backspace', label: '⌫', name: 'Backspace' },
      { value: 'Delete', label: 'Del', name: 'Delete' },
      { value: 'Insert', label: 'Ins', name: 'Insert' },
    ],
  },
  {
    id: 'arrows',
    title: 'Arrows & navigation',
    keys: [
      { value: 'ArrowUp', label: '↑', name: 'Arrow Up' },
      { value: 'ArrowDown', label: '↓', name: 'Arrow Down' },
      { value: 'ArrowLeft', label: '←', name: 'Arrow Left' },
      { value: 'ArrowRight', label: '→', name: 'Arrow Right' },
      { value: 'Home', label: 'Home' },
      { value: 'End', label: 'End' },
      { value: 'PageUp', label: 'PgUp', name: 'Page Up' },
      { value: 'PageDown', label: 'PgDn', name: 'Page Down' },
    ],
  },
  {
    id: 'letters',
    title: 'Letters',
    keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch) => ({
      value: ch,
      label: ch,
    })),
  },
  {
    id: 'digits',
    title: 'Numbers',
    keys: '0123456789'.split('').map((ch) => ({
      value: ch,
      label: ch,
    })),
  },
  {
    id: 'function',
    title: 'Function',
    keys: Array.from({ length: 12 }, (_, i) => {
      const n = i + 1
      return { value: `F${n}`, label: `F${n}` }
    }),
  },
  {
    id: 'symbols',
    title: 'Symbols',
    keys: [
      { value: '`', label: '`' },
      { value: '-', label: '-' },
      { value: '=', label: '=' },
      { value: '[', label: '[' },
      { value: ']', label: ']' },
      { value: '\\', label: '\\' },
      { value: ';', label: ';' },
      { value: "'", label: "'" },
      { value: ',', label: ',' },
      { value: '.', label: '.' },
      { value: '/', label: '/' },
    ],
  },
]

const ALL_KEYS = KEYBOARD_KEY_GROUPS.flatMap((g) => g.keys)

const BY_VALUE = new Map(ALL_KEYS.map((k) => [k.value, k]))

export function getKeyOption(value: string): KeyOption | undefined {
  if (BY_VALUE.has(value)) return BY_VALUE.get(value)
  // Case-insensitive letter lookup
  if (value.length === 1) {
    const upper = value.toUpperCase()
    if (BY_VALUE.has(upper)) return BY_VALUE.get(upper)
  }
  return undefined
}

export function formatKeyLabel(value: string): string {
  return getKeyOption(value)?.label ?? value
}

/** Parse "Control+Enter" / "Ctrl+Shift+A" / JSON array / single key. */
export function parseKeyChord(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean)
  }
  const text = String(raw ?? '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean)
    } catch {
      /* fall through */
    }
  }
  return text
    .split(/[+\s]+/)
    .map((part) => normalizeKeyToken(part))
    .filter(Boolean)
}

function normalizeKeyToken(token: string): string {
  const t = token.trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  const aliases: Record<string, string> = {
    ctrl: 'Control',
    control: 'Control',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
    cmd: 'Meta',
    command: 'Meta',
    win: 'Meta',
    windows: 'Meta',
    esc: 'Escape',
    escape: 'Escape',
    return: 'Enter',
    enter: 'Enter',
    space: ' ',
    spacebar: ' ',
    bs: 'Backspace',
    backspace: 'Backspace',
    del: 'Delete',
    delete: 'Delete',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
  }
  if (aliases[lower]) return aliases[lower]
  if (/^f([1-9]|1[0-2])$/i.test(t)) return t.toUpperCase()
  if (/^[a-z]$/i.test(t)) return t.toUpperCase()
  return t
}

/** Stable chord order: modifiers first, then other keys. */
export function normalizeChord(keys: string[]): string[] {
  const mods = ['Control', 'Alt', 'Shift', 'Meta']
  const unique: string[] = []
  for (const key of keys) {
    const n = normalizeKeyToken(key)
    if (!n || unique.includes(n)) continue
    unique.push(n)
  }
  const orderedMods = mods.filter((m) => unique.includes(m))
  const rest = unique.filter((k) => !MODIFIER_KEYS.has(k))
  return [...orderedMods, ...rest]
}

export function formatChord(keys: string[]): string {
  const chord = normalizeChord(keys)
  if (chord.length === 0) return ''
  return chord.map(formatKeyLabel).join(' + ')
}

export function chordToParam(keys: string[]): string {
  return normalizeChord(keys).join('+')
}

/** Max keys in one simultaneous press (modifiers + main). */
export const MAX_CHORD_KEYS = 4
