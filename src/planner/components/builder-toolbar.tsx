import {
  ArrowLeft,
  History,
  OctagonX,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { usePlannerStore, undoPlanner, redoPlanner } from '@/planner/store/planner-store'
import { ImportExportMenu } from '@/planner/components/import-export-menu'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { cn } from '@/shared/utils/cn'
import { useT } from '@/shared/i18n/use-t'

export function BuilderToolbar() {
  const t = useT()
  const workflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const workflows = usePlannerStore((s) => s.workflows)
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const dirty = usePlannerStore((s) => s.dirty)
  const saving = usePlannerStore((s) => s.saving)
  const checkpoint = usePlannerStore((s) => s.checkpoint)
  const persist = usePlannerStore((s) => s.persist)
  const saveVersion = usePlannerStore((s) => s.saveVersion)
  const setCheckpoint = usePlannerStore((s) => s.setCheckpoint)
  const setBuilderOpen = usePlannerStore((s) => s.setBuilderOpen)
  const runningPlan =
    checkpoint?.workflowId &&
    (checkpoint.status === 'running' ||
      checkpoint.status === 'paused' ||
      checkpoint.status === 'waiting')
      ? workflows.find((wf) => wf.id === checkpoint.workflowId)
      : undefined

  const temporal = usePlannerStore.temporal
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      void persist()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [dirty, persist, workflow?.updatedAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoPlanner()
        return
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoPlanner()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function runPlan() {
    if (!workflow) return
    await persist()
    const response = await sendRuntimeMessage<{ ok: boolean; checkpoint?: typeof checkpoint }>({
      type: 'PLANNER_START',
      payload: { workflow },
    })
    if (response.checkpoint) setCheckpoint(response.checkpoint)
  }

  return (
    <header className="relative z-[60] flex h-14 shrink-0 items-center gap-3 overflow-visible border-b border-border bg-card px-3 text-card-foreground backdrop-blur-xl">
      <Button
        size="sm"
        variant="ghost"
        className="rounded-xl"
        onClick={() => setBuilderOpen(false)}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('builder.workflows')}
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-sm font-semibold tracking-tight">
            {runningPlan?.name ?? workflow?.name ?? t('builder.noPlan')}
          </p>
          {checkpoint ? (
            <Badge
              variant={
                checkpoint.status === 'running'
                  ? 'default'
                  : checkpoint.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
              }
              className="capitalize"
            >
              {checkpoint.status}
            </Badge>
          ) : null}
          {runningPlan && runningPlan.id !== workflowId ? (
            <Badge variant="outline">{t('builder.runningElsewhere')}</Badge>
          ) : null}
          {dirty ? <Badge variant="warning">{t('builder.saving')}</Badge> : null}
          {saving ? (
            <Badge variant="outline">{t('builder.writing')}</Badge>
          ) : (
            <Badge variant="outline">{t('builder.autoSaved')}</Badge>
          )}
        </div>
        <p className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">
          {t('builder.autoSaveHint')}
        </p>
      </div>

      <ToolGroup>
        <IconBtn
          disabled={!canUndo}
          onClick={() => undoPlanner()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          disabled={!canRedo}
          onClick={() => redoPlanner()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => workflowId && saveVersion(workflowId)} title="Save version">
          <History className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => void persist()} title="Force save">
          <Save className="h-3.5 w-3.5" />
        </IconBtn>
      </ToolGroup>

      <ToolGroup>
        <Button size="sm" className="rounded-xl px-4" onClick={() => void runPlan()}>
          <Play className="h-3.5 w-3.5" />
          {t('builder.run')}
        </Button>
        <IconBtn
          onClick={() =>
            void sendRuntimeMessage({ type: 'PLANNER_PAUSE' }).then((res) => {
              const data = res as { checkpoint?: typeof checkpoint }
              if (data.checkpoint) setCheckpoint(data.checkpoint)
            })
          }
          title={t('common.pause')}
        >
          <Pause className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          destructive
          onClick={() =>
            void sendRuntimeMessage({ type: 'ENGINE_FORCE_STOP' }).then((res) => {
              const data = res as { checkpoint?: typeof checkpoint | null }
              if (data.checkpoint !== undefined) setCheckpoint(data.checkpoint)
              else setCheckpoint(null)
            })
          }
          title={t('engine.forceStopHint')}
        >
          <OctagonX className="h-3.5 w-3.5" />
        </IconBtn>
      </ToolGroup>

      <ImportExportMenu compact />

      <IconBtn
        title={t('common.reload')}
        onClick={() => {
          void sendRuntimeMessage({ type: 'EXTENSION_RELOAD' })
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </IconBtn>
    </header>
  )
}

function ToolGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-background/80 p-1">
      {children}
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  destructive,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => {
        // Keep focus quirks from stealing the click when editing inputs
        event.preventDefault()
      }}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40',
        destructive && 'hover:bg-destructive/15 hover:text-destructive',
      )}
    >
      {children}
    </button>
  )
}
