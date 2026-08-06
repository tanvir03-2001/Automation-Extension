import { Crosshair, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useElementPicker } from '@/planner/hooks/use-element-picker'
import { usePlannerStore } from '@/planner/store/planner-store'
import type { VisualWorkflow } from '@/planner/types/plan'

export const CONDITION_MANAGED_KEYS = new Set([
  'checkType',
  'sourceType',
  'left',
  'operator',
  'right',
  'text',
  'buttonName',
  'exact',
  'matchMode',
  'selector',
  'attribute',
  'value',
  'cases',
  'waitBeforeMs',
  'waitMs',
  'negate',
])

type Props = {
  workflowId: string
  nodeId: string
  params: Record<string, unknown>
  variant: 'if' | 'switch'
  workflow?: VisualWorkflow
  onChange: (patch: Record<string, unknown>) => void
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
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {help ? <p className="text-[11px] leading-snug text-muted-foreground">{help}</p> : null}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
}) {
  return (
    <select
      className="h-9 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function ConditionFields({
  workflowId,
  nodeId,
  params,
  variant,
  workflow,
  onChange,
}: Props) {
  const updateNodeData = usePlannerStore((s) => s.updateNodeData)
  const { picking, error, lastPicked, pickElement } = useElementPicker(workflow)
  const [pickingActive, setPickingActive] = useState(false)

  const checkType = String(params.checkType ?? 'element_visible')
  const sourceType = String(params.sourceType ?? 'variable')

  const needsSelector =
    variant === 'if'
      ? ['element_visible', 'element_exists', 'element_clickable'].includes(checkType) ||
        (checkType === 'button_name' && Boolean(params.selector))
      : sourceType === 'element_text' || sourceType === 'element_attribute'

  const needsButtonName = variant === 'if' && checkType === 'button_name'
  const needsText =
    variant === 'if' && (checkType === 'text_present' || checkType === 'text_gone')
  const needsVariable = variant === 'if' && checkType === 'variable'

  async function pickSelector() {
    setPickingActive(true)
    const picked = await pickElement()
    setPickingActive(false)
    if (!picked) return

    const fallbacks = picked.fallbacks ?? []
    const strategy =
      picked.strategy === 'text' || picked.strategy === 'aria' || picked.strategy === 'role'
        ? picked.strategy
        : 'css'
    const nextParams = {
      ...params,
      selector: picked.selector,
      selectorFallbacks: fallbacks,
    }
    onChange({ selector: picked.selector, selectorFallbacks: fallbacks })
    updateNodeData(workflowId, nodeId, {
      selector: {
        primary: picked.selector,
        fallbacks,
        strategy,
        autoHeal: true,
      },
      params: nextParams,
      ...(picked.text
        ? {
            label:
              variant === 'if'
                ? `If · ${picked.text.slice(0, 24)}`
                : `Switch · ${picked.text.slice(0, 24)}`,
          }
        : {}),
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-3">
      <p className="text-xs font-semibold text-foreground">
        {variant === 'if' ? 'If / Else condition' : 'Switch cases'}
      </p>

      {variant === 'if' ? (
        <Field
          label="Check what?"
          help="Choose what decides the true / false path"
        >
          <Select
            value={checkType}
            onChange={(value) => onChange({ checkType: value })}
            options={[
              { label: 'Element is visible (pick)', value: 'element_visible' },
              { label: 'Element exists (pick)', value: 'element_exists' },
              { label: 'Element is clickable (pick)', value: 'element_clickable' },
              { label: 'Button by name / label', value: 'button_name' },
              { label: 'Text is on page', value: 'text_present' },
              { label: 'Text is gone from page', value: 'text_gone' },
              { label: 'Variable compare', value: 'variable' },
            ]}
          />
        </Field>
      ) : (
        <Field
          label="Switch value from"
          help="Where the value to match against cases comes from"
        >
          <Select
            value={sourceType}
            onChange={(value) => onChange({ sourceType: value })}
            options={[
              { label: 'Variable / typed value', value: 'variable' },
              { label: 'Element text (pick)', value: 'element_text' },
              { label: 'Element attribute (pick)', value: 'element_attribute' },
            ]}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Wait before (ms)" help="Optional pause before checking">
          <Input
            type="number"
            value={String(params.waitBeforeMs ?? 0)}
            onChange={(event) => onChange({ waitBeforeMs: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="Check window (ms)" help="How long to keep looking">
          <Input
            type="number"
            value={String(params.waitMs ?? 2500)}
            onChange={(event) => onChange({ waitMs: Number(event.target.value) || 0 })}
          />
        </Field>
      </div>

      {needsSelector || (variant === 'if' && checkType === 'button_name') ? (
        <Field
          label={needsButtonName ? 'Button (optional pick) / name below' : 'Element'}
          help="Pick with mouse from the page"
        >
          <div className="space-y-2">
            <Input
              value={String(params.selector ?? '')}
              placeholder="CSS selector or pick with mouse"
              onChange={(event) => onChange({ selector: event.target.value })}
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full rounded-xl"
              disabled={picking}
              onClick={() => void pickSelector()}
            >
              {picking && pickingActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crosshair className="h-3.5 w-3.5" />
              )}
              {picking ? 'Click an element on the page…' : 'Pick with mouse'}
            </Button>
            {lastPicked ? (
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                Last: {lastPicked.selector}
              </p>
            ) : null}
            {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
          </div>
        </Field>
      ) : null}

      {needsButtonName ? (
        <>
          <Field label="Button name / label" help='Example: "Continue", "Send", "New chat"'>
            <Input
              value={String(params.buttonName ?? params.text ?? '')}
              placeholder="Continue"
              onChange={(event) =>
                onChange({ buttonName: event.target.value, text: event.target.value })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={Boolean(params.exact)}
              onChange={(event) => onChange({ exact: event.target.checked })}
            />
            Exact label match
          </label>
        </>
      ) : null}

      {needsText ? (
        <>
          <Field label="Text">
            <Input
              value={String(params.text ?? '')}
              placeholder="Text to find on page"
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </Field>
          <Field label="Match mode">
            <Select
              value={String(params.matchMode ?? 'contains')}
              onChange={(value) => onChange({ matchMode: value })}
              options={[
                { label: 'Contains', value: 'contains' },
                { label: 'Exact line', value: 'exact' },
                { label: 'Regex', value: 'regex' },
              ]}
            />
          </Field>
        </>
      ) : null}

      {needsVariable ? (
        <>
          <Field label="Left value" help="Use {{variable}} if needed">
            <Input
              value={String(params.left ?? '')}
              placeholder="{{myVar}}"
              onChange={(event) => onChange({ left: event.target.value })}
            />
          </Field>
          <Field label="Operator">
            <Select
              value={String(params.operator ?? 'equals')}
              onChange={(value) => onChange({ operator: value })}
              options={[
                { label: 'Equals', value: 'equals' },
                { label: 'Not Equals', value: 'not_equals' },
                { label: 'Contains', value: 'contains' },
                { label: 'Starts With', value: 'starts_with' },
                { label: 'Ends With', value: 'ends_with' },
                { label: 'Greater Than', value: 'gt' },
                { label: 'Less Than', value: 'lt' },
                { label: 'Empty', value: 'empty' },
                { label: 'Not Empty', value: 'not_empty' },
                { label: 'Regex', value: 'regex' },
              ]}
            />
          </Field>
          <Field label="Right value">
            <Input
              value={String(params.right ?? '')}
              onChange={(event) => onChange({ right: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      {variant === 'if' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            checked={Boolean(params.negate)}
            onChange={(event) => onChange({ negate: event.target.checked })}
          />
          Invert result (swap true / false)
        </label>
      ) : null}

      {variant === 'switch' && sourceType === 'variable' ? (
        <Field label="Value" help="Typed text or {{variable}}">
          <Input
            value={String(params.value ?? '')}
            placeholder="{{status}}"
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </Field>
      ) : null}

      {variant === 'switch' && sourceType === 'element_attribute' ? (
        <Field label="Attribute name">
          <Input
            value={String(params.attribute ?? 'href')}
            onChange={(event) => onChange({ attribute: event.target.value })}
          />
        </Field>
      ) : null}

      {variant === 'switch' ? (
        <>
          <Field
            label="Cases"
            help="Comma-separated. Each case becomes a branch handle. Unmatched → default"
          >
            <Input
              value={String(params.cases ?? '')}
              placeholder="Continue,Retry,Cancel"
              onChange={(event) => onChange({ cases: event.target.value })}
            />
          </Field>
          <Field label="Match mode">
            <Select
              value={String(params.matchMode ?? 'equals')}
              onChange={(value) => onChange({ matchMode: value })}
              options={[
                { label: 'Equals', value: 'equals' },
                { label: 'Contains', value: 'contains' },
                { label: 'Starts with', value: 'starts_with' },
                { label: 'Regex', value: 'regex' },
              ]}
            />
          </Field>
        </>
      ) : null}
    </div>
  )
}
