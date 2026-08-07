import { useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { usePlannerStore } from '@/planner/store/planner-store'
import { libraryToEditableText } from '@/planner/engine/text-library'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PlanTextLibrary } from '@/planner/types/plan'

const SAMPLE = `1. Sleeping on Mars
2. Journey Through the Galaxy
3. A Walk Through a Quiet Village
4. The Old Lighthouse
5. Overnight Train Across America
6. The Enchanted Library`

interface TextLibrariesPanelProps {
  planId: string | null
  compact?: boolean
}

export function TextLibrariesPanel({ planId, compact }: TextLibrariesPanelProps) {
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === planId))
  const upsertTextLibrary = usePlannerStore((s) => s.upsertTextLibrary)
  const deleteTextLibrary = usePlannerStore((s) => s.deleteTextLibrary)

  const libraries = plan?.textLibraries ?? []
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('story title')
  const [rawText, setRawText] = useState(SAMPLE)

  const editing = useMemo(
    () => libraries.find((lib) => lib.id === editingId) ?? null,
    [libraries, editingId],
  )

  function startCreate() {
    setCreating(true)
    setEditingId(null)
    setName('story title')
    setRawText(SAMPLE)
  }

  function startEdit(library: PlanTextLibrary) {
    setCreating(false)
    setEditingId(library.id)
    setName(library.name)
    setRawText(libraryToEditableText(library))
  }

  function cancel() {
    setCreating(false)
    setEditingId(null)
  }

  function save() {
    if (!planId) return
    upsertTextLibrary(planId, {
      id: editingId ?? undefined,
      name,
      rawText,
    })
    cancel()
  }

  if (!planId) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <p className="font-display text-lg font-semibold">Text libraries</p>
        <p className="mt-2 text-sm text-muted-foreground">Select a workflow first.</p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-border/80 bg-card text-card-foreground shadow-panel ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            Text libraries
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            নাম দিয়ে লিস্ট রাখুন (যেমন story title)। Type Text থেকে শুধু সেই লিস্ট বেছে All বা কয়েকটা
            title select করবেন — এখানে JSON লাগবে না।
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={startCreate}>
          <Plus className="h-3.5 w-3.5" />
          New list
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {libraries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No lists yet. Create one named <span className="font-medium text-foreground">story title</span>{' '}
            and paste numbered lines.
          </p>
        ) : (
          libraries.map((library) => (
            <div
              key={library.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{library.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {library.items.length} titles
                  {library.items[0] ? ` · ${library.items[0].title}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary">{library.items.length}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0"
                  onClick={() => startEdit(library)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0 text-destructive"
                  onClick={() => deleteTextLibrary(planId, library.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {creating || editing ? (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">List name</span>
            <Input
              value={name}
              placeholder="story title"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Titles (one per line)</span>
            <textarea
              className="min-h-40 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground outline-none ring-ring focus:ring-2"
              value={rawText}
              placeholder={SAMPLE}
              onChange={(event) => setRawText(event.target.value)}
            />
            <span className="block text-[10px] text-muted-foreground">
              Example: 1. Sleeping on Mars — number optional; commas at end are ignored
            </span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" onClick={save}>
              Save list
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
