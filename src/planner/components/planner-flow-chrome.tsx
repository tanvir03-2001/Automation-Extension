import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type MiniMapProps,
} from '@xyflow/react'

const panelClass =
  '!overflow-hidden !rounded-2xl !border !border-[hsl(var(--border))] !bg-[hsl(var(--card))] !shadow-lg'

type PlannerFlowChromeProps = {
  /** Background layer id (avoid duplicate ids when two canvases mount). */
  backgroundId?: string
  /** Preview passes false so lock/unlock control is hidden. */
  showInteractive?: boolean
  /** Optional MiniMap overrides (e.g. ariaLabel). */
  minimapProps?: Omit<MiniMapProps, 'className' | 'pannable' | 'zoomable' | 'maskColor' | 'nodeColor'>
}

/** Shared Background + MiniMap + Controls matching the Visual Editor canvas. */
export function PlannerFlowChrome({
  backgroundId = 'dots',
  showInteractive = true,
  minimapProps,
}: PlannerFlowChromeProps) {
  return (
    <>
      <Background
        id={backgroundId}
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.4}
        color="#c5ceda"
      />
      <MiniMap
        pannable
        zoomable
        className={panelClass}
        maskColor="rgba(15, 23, 42, 0.08)"
        nodeColor={() => '#0f766e'}
        {...minimapProps}
      />
      <Controls showInteractive={showInteractive} className={panelClass} />
    </>
  )
}
