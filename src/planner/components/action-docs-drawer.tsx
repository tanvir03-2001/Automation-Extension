import { BookOpen, GripHorizontal, MousePointerClick, X } from 'lucide-react'
import { getActionDocs } from '@/planner/actions/action-docs'
import { ActionIcon } from '@/planner/components/action-icons'
import { usePlannerStore } from '@/planner/store/planner-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ActionDocsDrawer() {
  const docsActionId = usePlannerStore((s) => s.docsActionId)
  const setDocsActionId = usePlannerStore((s) => s.setDocsActionId)
  if (!docsActionId) return null

  const docs = getActionDocs(docsActionId)
  if (!docs) return null

  const { action, tooltip, howto, fields } = docs

  return (
    <aside className="absolute inset-y-0 right-[min(420px,38vw)] z-[95] flex w-[340px] max-w-[min(340px,calc(100%-280px-min(420px,38vw)))] flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: action.color }}
        >
          <ActionIcon name={action.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            How this works
          </p>
          <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
            {action.name}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{action.id}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-lg p-0"
          onClick={() => setDocsActionId(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{action.category}</Badge>
            {action.supportsSelector ? <Badge variant="outline">Supports pick</Badge> : null}
            {action.controlFlow ? <Badge variant="outline">Flow control</Badge> : null}
          </div>

          <section className="rounded-2xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              In plain English
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tooltip}</p>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold text-foreground">How to use</p>
            <ol className="space-y-2">
              {howto.map((step, index) => (
                <li
                  key={index}
                  className="flex gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs leading-relaxed text-foreground"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <GripHorizontal className="h-3.5 w-3.5 text-primary" />
              Connect steps (no coding)
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>Drag an action from the left menu onto the board.</li>
              <li>
                Drag from a green dot on the right of one step to the green dot on the left of the
                next step.
              </li>
              <li>
                For “Repeat If More Titles”, open Properties and pick the step from the dropdown
                (example: Click · New chat).
              </li>
            </ul>
          </section>

          {fields.length ? (
            <section>
              <p className="mb-2 text-xs font-semibold text-foreground">Settings you can edit</p>
              <div className="space-y-2">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="rounded-xl border border-border px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-foreground">{field.label}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {field.help ?? `Field type: ${field.type}`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Tip: hover any action in the left menu for a short tip. Click it to open this guide.
            Drag it to add it to the board.
          </p>
        </div>
      </ScrollArea>
    </aside>
  )
}
