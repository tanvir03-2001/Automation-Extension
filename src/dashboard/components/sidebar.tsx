import { motion } from 'framer-motion'
import {
  Activity,
  Crosshair,
  LayoutDashboard,
  ListOrdered,
  Moon,
  Network,
  RotateCcw,
  Settings2,
  Sun,
  Workflow,
} from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore, type DashboardView } from '@/stores/dashboard-store'
import { usePlannerStore } from '@/planner/store/planner-store'
import { reloadExtension } from '@/dashboard/api/extension-api'
import { Button } from '@/components/ui/button'

const items: Array<{ id: DashboardView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'planner', label: 'Planner', icon: Network },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'selector-lab', label: 'Selector Lab', icon: Crosshair },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

export function Sidebar() {
  const view = useDashboardStore((s) => s.view)
  const setView = useDashboardStore((s) => s.setView)
  const builderOpen = usePlannerStore((s) => s.builderOpen)
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)
  const theme = usePlannerStore((s) => s.theme)
  const setTheme = usePlannerStore((s) => s.setTheme)

  if (builderOpen && view === 'planner') {
    return null
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/90 text-card-foreground backdrop-blur-2xl">
      <div className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-emerald-900/10">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-foreground">
              Automation
            </p>
            <p className="text-[11px] text-muted-foreground">Workflow engine</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setBuilderOpen(false)
                setView(item.id)
              }}
              className={cn(
                'relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-primary/15"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10 font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="space-y-2 border-t border-border px-4 py-4">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center rounded-xl"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center rounded-xl"
          onClick={() => void reloadExtension()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reload extension
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Manifest V3 · Browser automation only
        </p>
      </div>
    </aside>
  )
}
