import { useEffect, useState, type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { cn } from '@/shared/utils/cn'

function useIsLg() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsLg(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isLg
}

function HubResizeHandle({
  direction,
  className,
}: {
  direction: 'horizontal' | 'vertical'
  className?: string
}) {
  const vertical = direction === 'vertical'
  return (
    <PanelResizeHandle
      className={cn(
        'group relative shrink-0 bg-transparent transition-colors',
        vertical ? 'h-3 w-full' : 'h-full w-3',
        className,
      )}
    >
      <span
        className={cn(
          'absolute rounded-full bg-border transition-colors group-hover:bg-primary/50 group-data-[resize-handle-active]:bg-primary',
          vertical
            ? 'inset-x-8 top-1/2 h-1 -translate-y-1/2'
            : 'inset-y-8 left-1/2 w-1 -translate-x-1/2',
        )}
      />
    </PanelResizeHandle>
  )
}

/**
 * Mouse-resizable Workflows | Plans / Datasets hub shell.
 * Defaults match the previous ~41/59 horizontal and 50/50 vertical split.
 */
export function PlannerHubLayout({
  workflows,
  plans,
  datasets,
}: {
  workflows: ReactNode
  plans: ReactNode
  datasets: ReactNode
}) {
  const isLg = useIsLg()

  if (!isLg) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="min-h-[220px] shrink-0">{workflows}</div>
        <PanelGroup
          direction="vertical"
          autoSaveId="ae:planner-hub-layout-v"
          className="min-h-0 flex-1"
        >
          <Panel defaultSize={50} minSize={22} className="min-h-0">
            <div className="h-full min-h-0">{plans}</div>
          </Panel>
          <HubResizeHandle direction="vertical" />
          <Panel defaultSize={50} minSize={22} className="min-h-0">
            <div className="h-full min-h-0">{datasets}</div>
          </Panel>
        </PanelGroup>
      </div>
    )
  }

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId="ae:planner-hub-layout-h"
      className="min-h-0 flex-1"
    >
      <Panel defaultSize={41} minSize={18} className="min-w-0">
        <div className="h-full min-h-0 pr-1.5">{workflows}</div>
      </Panel>
      <HubResizeHandle direction="horizontal" />
      <Panel defaultSize={59} minSize={28} className="min-w-0">
        <PanelGroup
          direction="vertical"
          autoSaveId="ae:planner-hub-layout-v"
          className="h-full min-h-0 pl-1.5"
        >
          <Panel defaultSize={50} minSize={20} className="min-h-0">
            <div className="h-full min-h-0 pb-1.5">{plans}</div>
          </Panel>
          <HubResizeHandle direction="vertical" />
          <Panel defaultSize={50} minSize={20} className="min-h-0">
            <div className="h-full min-h-0 pt-1.5">{datasets}</div>
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )
}
