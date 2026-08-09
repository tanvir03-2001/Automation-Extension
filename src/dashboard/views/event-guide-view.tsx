import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EventGuidePanel } from '@/dashboard/components/guide/event-guide-panel'
import { groupGuideActions } from '@/dashboard/guide/build-event-guide'
import { ActionIcon } from '@/planner/components/action-icons'
import { localizeAction } from '@/shared/i18n/action-locale'
import { useLocale, useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'

export function EventGuideView() {
  const t = useT()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('mouse.click')

  const groups = useMemo(() => groupGuideActions(locale), [locale])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((group) => ({
        ...group,
        actions: group.actions.filter((action) => {
          const loc = localizeAction(action, locale)
          return (
            action.id.toLowerCase().includes(q) ||
            action.name.toLowerCase().includes(q) ||
            action.description.toLowerCase().includes(q) ||
            (loc?.name.toLowerCase().includes(q) ?? false) ||
            (loc?.description.toLowerCase().includes(q) ?? false)
          )
        }),
      }))
      .filter((group) => group.actions.length > 0)
  }, [groups, locale, query])

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <header className="shrink-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('guide.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t('guide.subtitle')}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card shadow-panel">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('guide.search')}
                className="h-9 rounded-xl pl-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-3">
              {filteredGroups.map((group) => (
                <div key={group.category}>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('cat.' + group.category)}
                  </p>
                  <div className="space-y-1">
                    {group.actions.map((action) => {
                      const loc = localizeAction(action, locale) ?? action
                      const active = selectedId === action.id
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setSelectedId(action.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                            active
                              ? 'bg-primary/15 text-foreground'
                              : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                          )}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-foreground"
                            style={{ background: action.color }}
                          >
                            <ActionIcon name={action.icon} className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {loc.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {!filteredGroups.length ? (
                <p className="px-1 text-xs text-muted-foreground">{t('guide.noResults')}</p>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId + locale}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="h-full min-h-0"
            >
              <EventGuidePanel actionId={selectedId} className="h-full" />
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
