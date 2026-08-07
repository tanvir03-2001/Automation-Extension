import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from '@/dashboard/components/sidebar'
import { useDashboardData } from '@/dashboard/hooks/use-dashboard-data'
import { useDashboardStore } from '@/stores/dashboard-store'
import { OverviewView } from '@/dashboard/views/overview-view'
import { WorkflowsView } from '@/dashboard/views/workflows-view'
import { QueueView } from '@/dashboard/views/queue-view'
import { ActivityView } from '@/dashboard/views/activity-view'
import { SettingsView } from '@/dashboard/views/settings-view'
import { SelectorLabView } from '@/dashboard/views/selector-lab-view'
import { PlannerView } from '@/planner/views/planner-view'
import { usePlannerStore } from '@/planner/store/planner-store'
import { useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'

function ViewRouter() {
  const view = useDashboardStore((s) => s.view)

  switch (view) {
    case 'overview':
      return <OverviewView />
    case 'planner':
      return <PlannerView />
    case 'workflows':
      return <WorkflowsView />
    case 'selector-lab':
      return <SelectorLabView />
    case 'queue':
      return <QueueView />
    case 'activity':
      return <ActivityView />
    case 'settings':
      return <SettingsView />
    default:
      return <OverviewView />
  }
}

export default function App() {
  const t = useT()
  const { isLoading } = useDashboardData()
  const view = useDashboardStore((s) => s.view)
  const builderOpen = usePlannerStore((s) => s.builderOpen)
  const hydrateTheme = usePlannerStore((s) => s.hydrate)
  const theme = usePlannerStore((s) => s.theme)
  const fullBleed = view === 'planner' && builderOpen
  // Overview sections stretch to the viewport; planner builder is edge-to-edge.
  const fillHeight = fullBleed || view === 'overview'

  // Ensure dark/light tokens apply on every dashboard surface (not only Planner).
  useEffect(() => {
    void hydrateTheme()
  }, [hydrateTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="flex h-full overflow-hidden bg-[hsl(var(--background))]">
      <Sidebar />
      <main
        className={cn(
          'relative flex-1 min-h-0',
          fillHeight ? 'overflow-hidden' : 'overflow-auto',
        )}
      >
        {!fullBleed && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-card/40 to-transparent" />
        )}
        <div
          className={cn(
            'relative w-full max-w-none',
            fillHeight && 'flex h-full min-h-0 flex-col',
            !fullBleed && 'px-4 py-5 md:px-6 md:py-6 lg:px-8',
          )}
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className={cn(fillHeight && 'flex min-h-0 flex-1 flex-col')}
              >
                <ViewRouter />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  )
}
