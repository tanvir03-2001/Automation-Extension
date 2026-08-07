import { useEffect, useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  Copy,
  Crosshair,
  FlaskConical,
  Loader2,
  MousePointerClick,
  Trash2,
  XCircle,
} from 'lucide-react'
import { usePlannerStore } from '@/planner/store/planner-store'
import { getActionById } from '@/planner/actions/catalog'
import { ActionIcon } from '@/planner/components/action-icons'
import { useElementPicker } from '@/planner/hooks/use-element-picker'
import {
  TYPE_TEXT_MANAGED_KEYS,
  TypeTextFields,
} from '@/planner/components/type-text-fields'
import {
  CONDITION_MANAGED_KEYS,
  ConditionFields,
} from '@/planner/components/condition-fields'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { cn } from '@/shared/utils/cn'
import type { VisualWorkflow } from '@/planner/types/plan'

type QuickTestResult = {
  ok: boolean
  message: string
  detail?: string
}

function resolveUrlHint(workflow?: VisualWorkflow | null): string {
  if (!workflow) return 'https://chatgpt.com/'
  for (const node of workflow.nodes) {
    const url = node.data.params.url
    if (typeof url === 'string' && url.startsWith('http')) return url
    if (node.data.actionId.includes('chatgpt')) return 'https://chatgpt.com/'
    if (String(node.data.params.url ?? '').includes('deepseek')) return 'https://chat.deepseek.com/'
  }
  return 'https://chatgpt.com/'
}

function labelAfterPick(currentLabel: string, actionId: string, pickedText?: string): string {
  if (!pickedText) return currentLabel
  const snippet = pickedText.slice(0, 28)
  if (actionId === 'clipboard.copy_event') {
    if (currentLabel === 'Copy Event' || currentLabel.startsWith('Copy Event ·')) {
      return `Copy Event · ${snippet}`
    }
    return currentLabel
  }
  if (currentLabel === 'Click') return `Click · ${snippet}`
  return currentLabel
}

export function PropertyInspector() {
  const workflowId = usePlannerStore((s) => s.selectedWorkflowId)
  const nodeId = usePlannerStore((s) => s.selectedNodeId)
  const workflows = usePlannerStore((s) => s.workflows)
  const workflow = usePlannerStore((s) => s.workflows.find((wf) => wf.id === workflowId))
  const updateNodeData = usePlannerStore((s) => s.updateNodeData)
  const toggleNodeEnabled = usePlannerStore((s) => s.toggleNodeEnabled)
  const duplicateNode = usePlannerStore((s) => s.duplicateNode)
  const removeNode = usePlannerStore((s) => s.removeNode)
  const { picking, error, lastPicked, pickElement } = useElementPicker(workflow)
  const [activePickField, setActivePickField] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<QuickTestResult | null>(null)

  useEffect(() => {
    setTestResult(null)
    setTesting(false)
  }, [nodeId])

  const node = workflow?.nodes.find((item) => item.id === nodeId)
  if (!workflowId || !node) {
    return (
      <aside className="relative z-[100] flex w-[min(420px,38vw)] min-w-[320px] shrink-0 flex-col items-center justify-center border-l border-border bg-card px-6 text-center text-card-foreground backdrop-blur-xl">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <MousePointerClick className="h-5 w-5" />
        </div>
        <p className="font-display text-base font-semibold text-foreground">No step selected</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Click a node on the canvas to edit labels, selectors, and options — no coding required.
        </p>
      </aside>
    )
  }

  const selectedNode = node
  const action = getActionById(selectedNode.data.actionId)
  const accent = selectedNode.data.color ?? action?.color ?? '#0f766e'

  async function runQuickTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const params = selectedNode.data.params
      const selector =
        selectedNode.data.selector?.primary ||
        String(params.selector ?? '')
      const fallbacks = selectedNode.data.selector?.fallbacks ?? []
      const checkType = String(params.checkType ?? '')
      const actionId = selectedNode.data.actionId

      // Copy Event / Write Clipboard: run the FULL action (click → capture → store)
      // so users can verify save without replaying the whole workflow.
      if (actionId === 'clipboard.copy_event' || actionId === 'clipboard.write') {
        if (actionId === 'clipboard.copy_event') {
          const mode = String(params.sourceMode ?? 'click_copy_button')
          if (
            (mode === 'click_copy_button' || mode === 'extract_from_element') &&
            !selector &&
            fallbacks.length === 0
          ) {
            setTestResult({
              ok: false,
              message: 'Fail — আগে Pick Copy button দিয়ে বাটন select করুন',
            })
            return
          }
          if (mode === 'manual_or_variable' && !String(params.text ?? '').trim()) {
            setTestResult({
              ok: false,
              message: 'Fail — Manual mode-এ Text দিন (বা {{variable}})',
            })
            return
          }
        }

        const response = await sendRuntimeMessage<{
          ok: boolean
          error?: string
          result?: {
            storedAs?: string
            textPreview?: string
            textLength?: number
            format?: string
            sourceMode?: string
            clipboardOk?: boolean
            clipboardError?: string
          }
          checkpoint?: unknown
        }>({
          type: 'PLANNER_TEST_ACTION',
          payload: {
            workflowId,
            planId: workflow?.planId,
            actionId,
            params,
            selector,
            fallbacks,
            timeoutMs: selectedNode.data.timeoutMs ?? 30_000,
          },
        })

        if (response.checkpoint !== undefined) {
          usePlannerStore.getState().setCheckpoint(
            response.checkpoint as ReturnType<typeof usePlannerStore.getState>['checkpoint'],
          )
        }

        if (!response.ok) {
          setTestResult({
            ok: false,
            message: response.error ?? 'Copy Event test failed',
          })
          return
        }

        const data = response.result
        setTestResult({
          ok: true,
          message: data?.storedAs
            ? `OK — saved as ${data.storedAs}`
            : 'OK — Copy action executed',
          detail: [
            data?.format ? `format=${data.format}` : '',
            data?.textLength != null ? `${data.textLength} chars` : '',
            data?.clipboardOk === false
              ? `clipboard warn: ${data.clipboardError ?? 'failed'}`
              : data?.clipboardOk
                ? 'clipboard ok'
                : '',
            data?.textPreview ? `preview: ${data.textPreview}` : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        })
        return
      }

      if (actionId === 'flow.next_plan_execute') {
        const targetId = String(params.workflowId ?? '').trim()
        if (!targetId) {
          setTestResult({
            ok: false,
            message: 'Fail — Target plan select করুন',
          })
          return
        }
        const target = workflows.find((wf) => wf.id === targetId)
        if (!target) {
          setTestResult({
            ok: false,
            message: 'Fail — Target plan পাওয়া যায়নি (deleted?)',
          })
          return
        }
        if (target.planId !== workflow?.planId) {
          setTestResult({
            ok: false,
            message: 'Fail — Target plan অন্য Workflow-এ আছে',
          })
          return
        }
        if (target.id === workflowId) {
          setTestResult({
            ok: false,
            message: 'Fail — Current plan-কে target করা যাবে না',
          })
          return
        }
        setTestResult({
          ok: true,
          message: `OK — next plan: ${target.name}`,
          detail: 'Run the plan to hand off execution (Quick test does not start it).',
        })
        return
      }

      const noTarget =
        actionId.startsWith('flow.') ||
        actionId.startsWith('logging.') ||
        actionId.startsWith('variables.') ||
        actionId === 'wait.delay' ||
        actionId === 'browser.wait_for_page'

      if (noTarget && !selector) {
        setTestResult({
          ok: true,
          message: 'এই step page element target করে না — selector test দরকার নেই',
        })
        return
      }

      let kind = 'selector'
      let text = ''
      if (actionId === 'conditions.if' || actionId === 'conditions.switch') {
        if (checkType === 'button_name') {
          kind = 'button_name'
          text = String(params.buttonName ?? params.text ?? '')
        } else if (checkType === 'text_present' || checkType === 'text_gone') {
          kind = 'text_present'
          text = String(params.text ?? '')
        }
      }

      if (!selector && !text && fallbacks.length === 0) {
        setTestResult({
          ok: false,
          message: 'Fail — আগে Pick with mouse দিয়ে element select করুন',
        })
        return
      }

      const value = String(
        params.text ?? params.value ?? params.manualText ?? params.content ?? '',
      )

      const response = await sendRuntimeMessage<{
        ok: boolean
        error?: string
        result?: {
          found?: boolean
          visible?: boolean
          clickable?: boolean
          matchedBy?: string
          tagName?: string
          text?: string
          message?: string
          triggered?: string | null
          triggerError?: string
        }
      }>({
        type: 'TEST_SELECTOR',
        payload: {
          selector,
          fallbacks,
          text,
          value,
          kind,
          exact: Boolean(params.exact),
          matchMode: String(params.matchMode ?? 'contains'),
          urlHint: resolveUrlHint(workflow),
          actionId,
          fireEvent: true,
        },
      })

      if (!response.ok) {
        setTestResult({
          ok: false,
          message: response.error ?? 'Test failed',
        })
        return
      }

      const data = response.result
      const eventOk = !data?.triggerError
      setTestResult({
        ok: Boolean(data?.found && data?.visible !== false && eventOk),
        message: data?.message ?? (data?.found ? 'OK — element পাওয়া গেছে' : 'Fail — পাওয়া যায়নি'),
        detail: [
          data?.matchedBy ? `Matched: ${data.matchedBy}` : '',
          data?.clickable ? 'clickable' : '',
          data?.triggered ? `Event: ${data.triggered}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      })
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }

  async function applyPickedSelector(fieldKey: string) {
    setActivePickField(fieldKey)
    const picked = await pickElement()
    setActivePickField(null)
    if (!picked || !workflowId) return

    const latest =
      usePlannerStore.getState().workflows
        .find((wf) => wf.id === workflowId)
        ?.nodes.find((item) => item.id === selectedNode.id) ?? selectedNode

    const strategy =
      picked.strategy === 'text' || picked.strategy === 'aria' || picked.strategy === 'role'
        ? picked.strategy
        : 'css'
    const fallbacks = picked.fallbacks ?? []

    if (fieldKey === '__primary') {
      updateNodeData(workflowId, latest.id, {
        selector: {
          primary: picked.selector,
          fallbacks,
          strategy,
          autoHeal: latest.data.selector?.autoHeal ?? true,
        },
        params: {
          ...latest.data.params,
          selector: picked.selector,
          selectorFallbacks: fallbacks,
        },
        label: labelAfterPick(latest.data.label, latest.data.actionId, picked.text),
      })
      return
    }

    updateNodeData(workflowId, latest.id, {
      params: {
        ...latest.data.params,
        [fieldKey]: picked.selector,
        selectorFallbacks: fallbacks,
      },
      selector:
        fieldKey === 'selector'
          ? {
              primary: picked.selector,
              fallbacks,
              strategy,
              autoHeal: latest.data.selector?.autoHeal ?? true,
            }
          : latest.data.selector,
      label: labelAfterPick(latest.data.label, latest.data.actionId, picked.text),
    })
  }

  return (
    <aside className="relative z-[100] flex w-[min(420px,38vw)] min-w-[320px] shrink-0 flex-col overflow-hidden border-l border-border bg-card text-card-foreground backdrop-blur-xl">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm"
            style={{ background: accent }}
          >
            <ActionIcon name={action?.icon} className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Properties
            </p>
            <p className="break-words font-display text-lg font-semibold leading-tight text-foreground">
              {selectedNode.data.label}
            </p>
            <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
              {selectedNode.data.actionId}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{action?.category ?? 'action'}</Badge>
          <Badge variant={selectedNode.data.enabled ? 'success' : 'outline'}>
            {selectedNode.data.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        <div className="mt-3 space-y-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
          <p className="text-xs font-semibold text-foreground">Quick test</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {selectedNode.data.actionId === 'clipboard.copy_event' ||
            selectedNode.data.actionId === 'clipboard.write'
              ? 'পুরো Copy Event চালাবে: Copy বাটন click → text capture → Copy Store-এ save। পুরো workflow চালানোর দরকার নেই।'
              : 'Target element-এ green border দেখাবে এবং এই step-এর event (click / hover / type…) একই সাথে fire করবে।'}
          </p>
          <Button
            size="sm"
            className="w-full rounded-xl"
            disabled={testing || picking}
            onClick={() => void runQuickTest()}
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {testing
              ? 'Testing…'
              : selectedNode.data.actionId === 'clipboard.copy_event'
                ? 'Test Copy Event'
                : 'Quick test'}
          </Button>
          {testResult ? (
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl border px-2.5 py-2 text-[11px] leading-relaxed',
                testResult.ok
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-500/35 bg-rose-500/10 text-rose-100',
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-foreground">{testResult.message}</p>
                {testResult.detail ? (
                  <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                    {testResult.detail}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 space-y-4 p-4">
          {selectedNode.data.actionId !== 'conditions.if' &&
            selectedNode.data.actionId !== 'conditions.switch' &&
            (action?.supportsSelector ||
              action?.fields.some((field) => field.type === 'selector') ||
              selectedNode.data.actionId.startsWith('mouse.') ||
              selectedNode.data.actionId.startsWith('ai.click') ||
              selectedNode.data.actionId === 'clipboard.copy_event') && (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-xs font-semibold text-foreground">
                {selectedNode.data.actionId === 'clipboard.copy_event'
                  ? 'Pick Copy button with mouse'
                  : 'Pick element with mouse'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {selectedNode.data.actionId === 'clipboard.copy_event'
                  ? 'বাটনে ক্লিক করুন → পেজ খুলবে → page-এর Copy বাটনে ক্লিক করুন। Runtime-এ সেই বাটন click হবে, text capture হবে, Copy Store-এ save হবে।'
                  : 'বাটনে ক্লিক করুন → পেজ খুলবে → যেখানে ক্লিক করবেন সেই element selector হিসেবে সেভ হবে।'}
              </p>
              <Button
                size="sm"
                className="mt-3 w-full rounded-xl"
                disabled={picking}
                onClick={() => void applyPickedSelector('selector')}
              >
                {picking && activePickField === 'selector' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5" />
                )}
                {picking
                  ? 'Click an element on the page…'
                  : selectedNode.data.actionId === 'clipboard.copy_event'
                    ? 'Pick Copy button'
                    : 'Pick click target'}
              </Button>
              {lastPicked ? (
                <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                  Last: {lastPicked.selector}
                </p>
              ) : null}
              {error ? (
                <p className="mt-2 text-[11px] text-destructive">{error}</p>
              ) : null}
            </div>
          )}

          <Field label="Label">
            <Input
              value={selectedNode.data.label}
              onChange={(event) =>
                updateNodeData(workflowId, selectedNode.id, { label: event.target.value })
              }
            />
          </Field>

          <Field label="Timeout (ms)">
            <Input
              type="number"
              value={selectedNode.data.timeoutMs}
              onChange={(event) =>
                updateNodeData(workflowId, selectedNode.id, {
                  timeoutMs: Number(event.target.value) || 30000,
                })
              }
            />
          </Field>

          {selectedNode.data.actionId === 'keyboard.type_text' ||
          selectedNode.data.actionId === 'keyboard.paste_text' ? (
            <TypeTextFields
              workflowId={workflowId}
              nodeId={selectedNode.id}
              params={selectedNode.data.params}
              variant={
                selectedNode.data.actionId === 'keyboard.paste_text' ? 'paste' : 'type'
              }
              onChange={(patch) =>
                updateNodeData(workflowId, selectedNode.id, {
                  params: { ...selectedNode.data.params, ...patch },
                })
              }
            />
          ) : null}

          {selectedNode.data.actionId === 'conditions.if' ||
          selectedNode.data.actionId === 'conditions.switch' ? (
            <ConditionFields
              workflowId={workflowId}
              nodeId={selectedNode.id}
              params={selectedNode.data.params}
              variant={selectedNode.data.actionId === 'conditions.switch' ? 'switch' : 'if'}
              workflow={workflow}
              onChange={(patch) =>
                updateNodeData(workflowId, selectedNode.id, {
                  params: { ...selectedNode.data.params, ...patch },
                  ...(typeof patch.selector === 'string'
                    ? {
                        selector: {
                          primary: String(patch.selector),
                          fallbacks: selectedNode.data.selector?.fallbacks ?? [],
                          strategy: selectedNode.data.selector?.strategy ?? 'css',
                          autoHeal: selectedNode.data.selector?.autoHeal ?? true,
                        },
                      }
                    : {}),
                })
              }
            />
          ) : null}

          {(action?.fields ?? []).map((field) => {
            if (
              (selectedNode.data.actionId === 'keyboard.type_text' ||
                selectedNode.data.actionId === 'keyboard.paste_text') &&
              TYPE_TEXT_MANAGED_KEYS.has(field.key)
            ) {
              return null
            }
            if (
              (selectedNode.data.actionId === 'conditions.if' ||
                selectedNode.data.actionId === 'conditions.switch') &&
              CONDITION_MANAGED_KEYS.has(field.key)
            ) {
              return null
            }

            const isSelectorField =
              field.type === 'selector' || field.key.toLowerCase().includes('selector')
            return (
              <Field key={field.key} label={field.label} help={field.help}>
                {field.type === 'textarea' || field.type === 'json' ? (
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                    value={String(selectedNode.data.params[field.key] ?? field.defaultValue ?? '')}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      updateNodeData(workflowId, selectedNode.id, {
                        params: { ...selectedNode.data.params, [field.key]: event.target.value },
                      })
                    }
                  />
                ) : field.type === 'boolean' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={Boolean(
                        selectedNode.data.params[field.key] ?? field.defaultValue ?? false,
                      )}
                      onChange={(event) =>
                        updateNodeData(workflowId, selectedNode.id, {
                          params: {
                            ...selectedNode.data.params,
                            [field.key]: event.target.checked,
                          },
                        })
                      }
                    />
                    Enabled
                  </label>
                ) : field.type === 'select' ? (
                  <select
                    className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                    value={String(selectedNode.data.params[field.key] ?? field.defaultValue ?? '')}
                    onChange={(event) =>
                      updateNodeData(workflowId, selectedNode.id, {
                        params: { ...selectedNode.data.params, [field.key]: event.target.value },
                      })
                    }
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'nodeRef' ? (
                  <NodeRefSelect
                    nodes={workflow?.nodes ?? []}
                    currentNodeId={selectedNode.id}
                    value={String(selectedNode.data.params[field.key] ?? '')}
                    onChange={(nextId) =>
                      updateNodeData(workflowId, selectedNode.id, {
                        params: { ...selectedNode.data.params, [field.key]: nextId },
                      })
                    }
                  />
                ) : field.type === 'planRef' ? (
                  <PlanRefSelect
                    plans={workflows}
                    currentPlanId={workflow?.planId ?? null}
                    currentWorkflowId={workflowId}
                    value={String(selectedNode.data.params[field.key] ?? '')}
                    onChange={(nextId) =>
                      updateNodeData(workflowId, selectedNode.id, {
                        params: { ...selectedNode.data.params, [field.key]: nextId },
                      })
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={String(
                        selectedNode.data.params[field.key] ?? field.defaultValue ?? '',
                      )}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        updateNodeData(workflowId, selectedNode.id, {
                          params: {
                            ...selectedNode.data.params,
                            [field.key]:
                              field.type === 'number'
                                ? Number(event.target.value)
                                : event.target.value,
                          },
                        })
                      }
                    />
                    {isSelectorField ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full rounded-xl"
                        disabled={picking}
                        onClick={() => void applyPickedSelector(field.key)}
                      >
                        {picking && activePickField === field.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Crosshair className="h-3.5 w-3.5" />
                        )}
                        Pick with mouse
                      </Button>
                    ) : null}
                  </div>
                )}
              </Field>
            )
          })}

          {action?.supportsSelector &&
          selectedNode.data.actionId !== 'conditions.if' &&
          selectedNode.data.actionId !== 'conditions.switch' ? (
            <Field label="Primary selector" help="Mouse দিয়ে পেজ থেকে সিলেক্ট করুন">
              <div className="space-y-2">
                <Input
                  value={
                    selectedNode.data.selector?.primary ??
                    String(selectedNode.data.params.selector ?? '')
                  }
                  onChange={(event) =>
                    updateNodeData(workflowId, selectedNode.id, {
                      selector: {
                        primary: event.target.value,
                        fallbacks: selectedNode.data.selector?.fallbacks ?? [],
                        strategy: selectedNode.data.selector?.strategy ?? 'css',
                        autoHeal: selectedNode.data.selector?.autoHeal ?? true,
                      },
                      params: { ...selectedNode.data.params, selector: event.target.value },
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-xl"
                  disabled={picking}
                  onClick={() => void applyPickedSelector('__primary')}
                >
                  {picking && activePickField === '__primary' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="h-3.5 w-3.5" />
                  )}
                  Pick with mouse
                </Button>
                {(selectedNode.data.selector?.fallbacks?.length ?? 0) > 0 ? (
                  <div className="rounded-xl border border-border bg-muted/40 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Fallbacks (text / aria / svg / path)
                    </p>
                    <ul className="mt-1 space-y-1">
                      {selectedNode.data.selector!.fallbacks.map((item) => (
                        <li key={item} className="break-all font-mono text-[10px] text-muted-foreground">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => toggleNodeEnabled(workflowId, selectedNode.id)}
            >
              {selectedNode.data.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => duplicateNode(workflowId, selectedNode.id)}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="col-span-2 rounded-xl"
              onClick={() => removeNode(workflowId, selectedNode.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete step
            </Button>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {children}
      {help ? <span className="block text-[10px] text-muted-foreground">{help}</span> : null}
    </label>
  )
}

function NodeRefSelect({
  nodes,
  currentNodeId,
  value,
  onChange,
}: {
  nodes: Array<{ id: string; data: { label: string; actionId: string; enabled?: boolean } }>
  currentNodeId: string
  value: string
  onChange: (nodeId: string) => void
}) {
  const options = nodes.filter(
    (node) =>
      node.id !== currentNodeId &&
      node.data.actionId !== 'flow.start' &&
      node.data.actionId !== 'flow.end',
  )
  const resolved = options.some((node) => node.id === value)
  const orphanLabel =
    value && !resolved
      ? nodes.find((node) => node.id === value)?.data.label ?? value
      : null

  return (
    <div className="space-y-1.5">
      <select
        className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
        value={resolved ? value : value ? `__orphan__:${value}` : ''}
        onChange={(event) => {
          const next = event.target.value
          if (next.startsWith('__orphan__:')) {
            onChange(next.slice('__orphan__:'.length))
            return
          }
          onChange(next)
        }}
      >
        <option value="">Choose a step…</option>
        {orphanLabel ? (
          <option value={`__orphan__:${value}`}>
            Missing on canvas · {orphanLabel}
          </option>
        ) : null}
        {options.map((node) => (
          <option key={node.id} value={node.id}>
            {node.data.label}
            {node.data.enabled === false ? ' (disabled)' : ''}
          </option>
        ))}
      </select>
      {value && resolved ? (
        <p className="font-mono text-[10px] text-muted-foreground">Step id: {value}</p>
      ) : null}
    </div>
  )
}

/** Sibling Plans (VisualWorkflow) in the same Workflow (AutomationPlan). */
function PlanRefSelect({
  plans,
  currentPlanId,
  currentWorkflowId,
  value,
  onChange,
}: {
  plans: VisualWorkflow[]
  currentPlanId: string | null
  currentWorkflowId: string
  value: string
  onChange: (workflowId: string) => void
}) {
  const options = currentPlanId
    ? plans.filter((plan) => plan.planId === currentPlanId && plan.id !== currentWorkflowId)
    : []
  const resolved = options.some((plan) => plan.id === value)
  const orphan =
    value && !resolved ? plans.find((plan) => plan.id === value) ?? null : null
  const orphanWrongWorkflow =
    orphan && currentPlanId && orphan.planId !== currentPlanId

  return (
    <div className="space-y-1.5">
      <select
        className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
        value={resolved ? value : value ? `__orphan__:${value}` : ''}
        onChange={(event) => {
          const next = event.target.value
          if (next.startsWith('__orphan__:')) {
            onChange(next.slice('__orphan__:'.length))
            return
          }
          onChange(next)
        }}
      >
        <option value="">
          {options.length === 0 ? 'No other plans available…' : 'Choose a plan…'}
        </option>
        {orphan ? (
          <option value={`__orphan__:${value}`}>
            {orphanWrongWorkflow
              ? `Invalid · other Workflow · ${orphan.name}`
              : `Missing plan · ${orphan.name}`}
          </option>
        ) : null}
        {options.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
            {plan.enabled === false ? ' (disabled)' : ''}
          </option>
        ))}
      </select>
      {options.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          No other plans available in this workflow
        </p>
      ) : null}
      {orphanWrongWorkflow ? (
        <p className="text-[10px] text-destructive">
          Selected plan belongs to another Workflow — pick a plan from this Workflow.
        </p>
      ) : null}
      {value && resolved ? (
        <p className="font-mono text-[10px] text-muted-foreground">Plan id: {value}</p>
      ) : null}
    </div>
  )
}
