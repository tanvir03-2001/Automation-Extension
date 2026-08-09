import { AnimatePresence, motion } from 'framer-motion'
import { EventGuidePanel } from '@/dashboard/components/guide/event-guide-panel'
import { usePlannerStore } from '@/planner/store/planner-store'

/**
 * Full Event Guide overlay: fills the canvas band only.
 * Starts after the config/Properties drawer and ends at the event menu (palette).
 * Palette (280px) and PropertyInspector (min(420px,38vw)) stay visible.
 */
export function ActionDocsDrawer() {
  const docsActionId = usePlannerStore((s) => s.docsActionId)
  const setDocsActionId = usePlannerStore((s) => s.setDocsActionId)

  return (
    <AnimatePresence>
      {docsActionId ? (
        <motion.aside
          key="event-guide-overlay"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="absolute inset-y-0 left-[280px] right-[max(320px,min(420px,38vw))] z-[95] flex flex-col overflow-hidden border-x border-border bg-card text-card-foreground shadow-2xl"
        >
          <EventGuidePanel
            actionId={docsActionId}
            showClose
            onClose={() => setDocsActionId(null)}
            className="h-full"
          />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
