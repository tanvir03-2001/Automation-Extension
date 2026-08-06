import { useMemo } from 'react'
import { BookOpen, Search, Star } from 'lucide-react'
import { ACTION_CATEGORIES, searchActions } from '@/planner/actions/catalog'
import { getActionTooltip } from '@/planner/actions/action-docs'
import { ActionIcon } from '@/planner/components/action-icons'
import { usePlannerStore } from '@/planner/store/planner-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/shared/utils/cn'
import type { ActionDefinition } from '@/planner/actions/types'

export function ActionPalette() {
  const query = usePlannerStore((s) => s.actionQuery)
  const setActionQuery = usePlannerStore((s) => s.setActionQuery)
  const favorites = usePlannerStore((s) => s.favoriteActionIds)
  const toggleFavoriteAction = usePlannerStore((s) => s.toggleFavoriteAction)
  const setDocsActionId = usePlannerStore((s) => s.setDocsActionId)
  const docsActionId = usePlannerStore((s) => s.docsActionId)

  const actions = useMemo(() => searchActions(query), [query])
  const favoriteActions = useMemo(
    () => actions.filter((action) => favorites.includes(action.id)),
    [actions, favorites],
  )

  return (
    <TooltipProvider delayDuration={260} skipDelayDuration={100}>
      <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-card text-card-foreground backdrop-blur-xl">
        <div className="space-y-3 border-b border-border p-4">
          <div>
            <p className="font-display text-sm font-semibold tracking-tight text-foreground">
              Actions
            </p>
            <p className="text-[11px] text-muted-foreground">
              Hover for tip · Click for guide · Drag to canvas
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setActionQuery(event.target.value)}
              placeholder="Search actions…"
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none ring-ring transition focus:ring-2"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-3">
            {favoriteActions.length > 0 ? (
              <section>
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                  Favorites
                </p>
                <div className="space-y-1">
                  {favoriteActions.map((action) => (
                    <PaletteItem
                      key={`fav-${action.id}`}
                      action={action}
                      favorite
                      active={docsActionId === action.id}
                      onToggleFavorite={() => toggleFavoriteAction(action.id)}
                      onOpenDocs={() => setDocsActionId(action.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {ACTION_CATEGORIES.map((category) => {
              const items = actions.filter((action) => action.category === category)
              if (items.length === 0) return null
              return (
                <section key={category}>
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {items.map((action) => (
                      <PaletteItem
                        key={action.id}
                        action={action}
                        favorite={favorites.includes(action.id)}
                        active={docsActionId === action.id}
                        onToggleFavorite={() => toggleFavoriteAction(action.id)}
                        onOpenDocs={() => setDocsActionId(action.id)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}

function PaletteItem({
  action,
  favorite,
  active,
  onToggleFavorite,
  onOpenDocs,
}: {
  action: ActionDefinition
  favorite: boolean
  active: boolean
  onToggleFavorite: () => void
  onOpenDocs: () => void
}) {
  const tip = getActionTooltip(action)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/planner-action', action.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => onOpenDocs()}
          className={cn(
            'group flex cursor-grab items-center gap-2.5 rounded-xl border px-2 py-2 transition active:cursor-grabbing',
            active
              ? 'border-primary/40 bg-primary/10'
              : 'border-transparent hover:border-border hover:bg-accent/60',
          )}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
            style={{ background: action.color }}
          >
            <ActionIcon name={action.icon} className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">{action.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{action.description}</p>
          </div>
          <button
            type="button"
            aria-label="Open guide"
            className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              onOpenDocs()
            }}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
            className={cn(
              'rounded-md p-1 opacity-0 transition group-hover:opacity-100',
              favorite && 'opacity-100 text-amber-500',
            )}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite()
            }}
          >
            <Star className={cn('h-3.5 w-3.5', favorite && 'fill-current')} />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" className="w-[228px] p-0">
        <div className="overflow-hidden rounded-2xl">
          <div
            className="h-1 w-full"
            style={{ background: action.color }}
          />
          <div className="space-y-2 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
                style={{ background: action.color }}
              >
                <ActionIcon name={action.icon} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold leading-tight text-foreground">
                  {action.name}
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {action.category}
                </p>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{tip}</p>
            <p className="border-t border-border/60 pt-2 text-[10px] font-medium text-primary">
              Click for full guide · Drag to add
            </p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
