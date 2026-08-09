import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FlaskConical, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { usePlannerStore } from '@/planner/store/planner-store'
import { resolveLoopScope } from '@/planner/engine/loop-scope'
import { useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'
import type { PlannerNodeData } from '@/planner/types/plan'

type ReportTab = 'timeline' | 'output' | 'deps' | 'metrics' | 'logs'

interface TestRunReport {
  ok: boolean
  error?: string
  skipped?: boolean
  dependency?: {
    enabled: boolean
    logic: string
    passed: boolean
    rules: Array<{ passed: boolean; left?: unknown; error?: string; rule: { path: string; op: string } }>
  }
  timeline?: Array<{ at: string; phase: string; detail?: string; ms?: number }>
  performance?: {
    totalMs: number
    dependencyMs: number
    preWaitMs: number
    handlerMs: number
  }
  result?: {
    status?: string
    branch?: string
    output?: unknown
    error?: string
  }
  variables?: Record<string, unknown>
  browserLogs?: string[]
  logs?: string[]
}

interface EventTestPanelProps {
  workflowId: string
  planId?: string
  nodeId: string
  nodeData: PlannerNodeData
  actionName: string
}

export function EventTestPanel({
  workflowId,
  planId,
  nodeId,
  nodeData,
  actionName,
}: EventTestPanelProps) {
  const t = useT()
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const plan = usePlannerStore((s) =>
    s.plans.find((item) => item.id === (planId ?? workflow?.planId)),
  )
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tab, setTab] = useState<ReportTab>('timeline')
  const [inputsJson, setInputsJson] = useState('{}')
  const [persistVariables, setPersistVariables] = useState(false)
  const [report, setReport] = useState<TestRunReport | null>(null)

  useEffect(() => {
    setExpanded(false)
    setReport(null)
    setTesting(false)
    setTab('timeline')
    setPersistVariables(false)

    // Seed loop_item sample so isolated Event Test matches Map body without a full run
    const mode = String(nodeData.params.textMode ?? '')
    if (
      mode === 'loop_item' &&
      workflow &&
      (nodeData.actionId === 'keyboard.type_text' ||
        nodeData.actionId === 'keyboard.paste_text')
    ) {
      const scope = resolveLoopScope(workflow, nodeId, plan)
      if (scope.kind === 'body' && scope.stack.length) {
        const itemVariable =
          String(nodeData.params.textItemVariable ?? '').trim() ||
          scope.stack[scope.stack.length - 1]!.itemVariable
        const frame =
          scope.stack.find((item) => item.itemVariable === itemVariable) ??
          scope.stack[scope.stack.length - 1]!
        if (frame.sampleItem !== undefined) {
          setInputsJson(JSON.stringify({ [itemVariable]: frame.sampleItem }, null, 2))
          return
        }
      }
    }
    setInputsJson('{}')
  }, [
    nodeId,
    nodeData.actionId,
    nodeData.params.textMode,
    nodeData.params.textItemVariable,
    workflow,
    plan,
  ])

  async function runTest() {
    setTesting(true)
    setReport(null)
    let testInputs: Record<string, unknown> = {}
    try {
      testInputs = JSON.parse(inputsJson || '{}') as Record<string, unknown>
    } catch {
      setReport({ ok: false, error: t('exec.testInputsInvalid') })
      setExpanded(true)
      setTesting(false)
      return
    }

    try {
      const response = await sendRuntimeMessage<TestRunReport & { checkpoint?: unknown }>({
        type: 'PLANNER_TEST_ACTION',
        payload: {
          workflowId,
          planId,
          nodeId,
          actionId: nodeData.actionId,
          params: nodeData.params,
          selector: nodeData.selector?.primary,
          fallbacks: nodeData.selector?.fallbacks,
          timeoutMs: nodeData.timeoutMs ?? 30_000,
          nodeData,
          testInputs,
          datasets: plan?.datasets ?? [],
          persistVariables,
          captureBrowserLogs: true,
        },
      })

      if (response.checkpoint !== undefined) {
        usePlannerStore.getState().setCheckpoint(
          response.checkpoint as ReturnType<typeof usePlannerStore.getState>['checkpoint'],
        )
      }

      setReport(response)
      setTab(response.skipped ? 'deps' : 'timeline')
      // Auto-expand on failure or skip so the user can see details
      if (!response.ok || response.skipped) {
        setExpanded(true)
      }
    } catch (error) {
      setReport({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
      setExpanded(true)
    } finally {
      setTesting(false)
    }
  }

  const tabs: ReportTab[] = ['timeline', 'output', 'deps', 'metrics', 'logs']

  const statusChip = report
    ? report.ok
      ? report.skipped
        ? { label: t('exec.statusSkipped'), variant: 'warning' as const }
        : { label: t('exec.statusOk'), variant: 'success' as const }
      : { label: t('exec.statusFail'), variant: 'destructive' as const }
    : null

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-accent/60"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <FlaskConical className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">{t('exec.testShort')}</span>
          {statusChip ? (
            <Badge variant={statusChip.variant} className="ml-1 shrink-0 text-xs">
              {statusChip.label}
            </Badge>
          ) : null}
        </button>
        <Button
          size="sm"
          className="h-8 shrink-0 rounded-lg px-2.5"
          disabled={testing}
          onClick={(event) => {
            event.stopPropagation()
            void runTest()
          }}
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          {testing ? t('exec.testing') : t('exec.runTest')}
        </Button>
      </div>

      {!expanded ? (
        <button
          type="button"
          className="mt-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          {t('exec.showDetails')}
        </button>
      ) : null}

      {expanded ? (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('exec.testHelp')}</p>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              {t('exec.hideDetails')}
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t('exec.testInputs')}</span>
            <textarea
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-sm outline-none ring-ring focus:ring-2"
              value={inputsJson}
              spellCheck={false}
              onChange={(event) => setInputsJson(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={persistVariables}
              onChange={(event) => setPersistVariables(event.target.checked)}
            />
            {t('exec.persistVariables')}
          </label>

          {report ? (
            <div className="space-y-2">
              <p
                className={cn(
                  'rounded-lg px-2.5 py-2 text-sm',
                  report.ok
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-destructive/10 text-destructive',
                )}
              >
                {report.ok
                  ? report.skipped
                    ? t('exec.testSkipped', { name: actionName })
                    : t('exec.testOk', { name: actionName })
                  : report.error ?? t('exec.testFail', { name: actionName })}
              </p>

              <div className="flex flex-wrap gap-1">
                {tabs.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-medium',
                      tab === id
                        ? 'bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                    onClick={() => setTab(id)}
                  >
                    {t(`exec.tab.${id}`)}
                  </button>
                ))}
              </div>

              <div className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-xs leading-relaxed">
                {tab === 'timeline' ? (
                  report.timeline?.length ? (
                    <ul className="space-y-1">
                      {report.timeline.map((item, index) => (
                        <li key={index}>
                          <span className="text-muted-foreground">{item.phase}</span>
                          {item.detail ? ` — ${item.detail}` : ''}
                          {item.ms != null ? ` (${item.ms}ms)` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">{t('exec.noTimeline')}</p>
                  )
                ) : null}
                {tab === 'output' ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(
                      {
                        status: report.result?.status,
                        branch: report.result?.branch,
                        output: report.result?.output,
                        variables: report.variables,
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
                {tab === 'deps' ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(report.dependency ?? { enabled: false }, null, 2)}
                  </pre>
                ) : null}
                {tab === 'metrics' ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(report.performance ?? {}, null, 2)}
                  </pre>
                ) : null}
                {tab === 'logs' ? (
                  <ul className="space-y-1">
                    {(report.logs ?? report.browserLogs ?? []).length ? (
                      (report.logs ?? report.browserLogs ?? []).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))
                    ) : (
                      <li className="text-muted-foreground">{t('exec.noLogs')}</li>
                    )}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
