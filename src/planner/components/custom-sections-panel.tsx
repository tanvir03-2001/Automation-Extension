import { useMemo, useState } from 'react'
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { DynamicJsonEditor } from '@/planner/components/dynamic-json-editor'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PlanCustomSection } from '@/planner/types/plan'

interface CustomSectionsPanelProps {
  planId: string | null
}

export function CustomSectionsPanel({ planId }: CustomSectionsPanelProps) {
  const plan = usePlannerStore((s) => s.plans.find((item) => item.id === planId))
  const createCustomSection = usePlannerStore((s) => s.createCustomSection)
  const updateCustomSectionMeta = usePlannerStore((s) => s.updateCustomSectionMeta)
  const updateCustomSectionData = usePlannerStore((s) => s.updateCustomSectionData)
  const deleteCustomSection = usePlannerStore((s) => s.deleteCustomSection)

  const sections = plan?.customSections ?? []
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')

  const editingSection = useMemo(
    () => sections.find((section) => section.id === editingMetaId) ?? null,
    [sections, editingMetaId],
  )

  function openCreate() {
    setCreating(true)
    setTitle('')
    setDescription('')
  }

  function cancelCreate() {
    setCreating(false)
    setTitle('')
    setDescription('')
  }

  function saveCreate() {
    if (!planId || !title.trim()) return
    const id = createCustomSection(planId, {
      title: title.trim(),
      description: description.trim(),
    })
    setExpandedId(id)
    cancelCreate()
  }

  function startEditMeta(section: PlanCustomSection) {
    setEditingMetaId(section.id)
    setMetaTitle(section.title)
    setMetaDescription(section.description ?? '')
  }

  function saveMeta() {
    if (!planId || !editingMetaId) return
    updateCustomSectionMeta(planId, editingMetaId, {
      title: metaTitle,
      description: metaDescription,
    })
    setEditingMetaId(null)
  }

  if (!planId) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <p className="font-display text-lg font-semibold">Custom sections</p>
        <p className="mt-2 text-sm text-muted-foreground">Select a workflow first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Hardcoded Add Section control - below Text libraries / Copy Store */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-semibold">
              <FolderPlus className="h-4 w-4 text-primary" />
              Custom sections
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your own top-level JSON sections (lists, nested objects). They appear in Map’s
              Section dropdown alongside Text libraries and Copy Store.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl"
            onClick={openCreate}
            disabled={creating}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Section
          </Button>
        </div>

        {creating ? (
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Title</span>
              <Input
                className="h-9 rounded-xl"
                value={title}
                placeholder="e.g. Product catalog"
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Description</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                value={description}
                placeholder="What this section stores…"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-xl"
                disabled={!title.trim()}
                onClick={saveCreate}
              >
                Create section
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={cancelCreate}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {sections.length === 0 && !creating ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No custom sections yet. Click <span className="font-medium text-foreground">Add Section</span>{' '}
            to create one.
          </p>
        ) : null}
      </div>

      {sections.map((section) => {
        const open = expandedId === section.id
        return (
          <div
            key={section.id}
            className="rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-panel"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpandedId(open ? null : section.id)}
              >
                <p className="truncate font-display text-lg font-semibold text-foreground">
                  {section.title}
                </p>
                {section.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dynamic JSON section · click to {open ? 'collapse' : 'edit'}
                  </p>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary">JSON</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0"
                  title="Edit title / description"
                  onClick={() => startEditMeta(section)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0 text-rose-500"
                  title="Delete section"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete section “${section.title}”? This cannot be undone.`,
                      )
                    ) {
                      deleteCustomSection(planId, section.id)
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {editingSection?.id === section.id ? (
              <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <Input
                  className="h-9 rounded-xl"
                  value={metaTitle}
                  onChange={(event) => setMetaTitle(event.target.value)}
                />
                <textarea
                  className="min-h-16 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-xl" onClick={saveMeta}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setEditingMetaId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {open ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Add properties and nested lists freely - names are not hardcoded. Map can pick any
                  list path inside this section.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      if (Array.isArray(section.data)) return
                      updateCustomSectionData(planId, section.id, [])
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Make root a list
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      if (section.data && typeof section.data === 'object' && !Array.isArray(section.data)) {
                        return
                      }
                      updateCustomSectionData(planId, section.id, {})
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Make root an object
                  </Button>
                </div>
                <DynamicJsonEditor
                  value={section.data}
                  onChange={(data) => updateCustomSectionData(planId, section.id, data)}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
