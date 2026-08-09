import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/shared/i18n/use-t'
import type { DependencyOp, DependencyRule, RunWhen } from '@/planner/types/plan'

const OPS: DependencyOp[] = [
  'exists',
  'empty',
  'truthy',
  'falsy',
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
]

interface DependencyRulesPanelProps {
  value?: RunWhen
  onChange: (next: RunWhen) => void
}

export function DependencyRulesPanel({ value, onChange }: DependencyRulesPanelProps) {
  const t = useT()
  const runWhen: RunWhen = value ?? { logic: 'and', rules: [] }

  function updateRule(index: number, patch: Partial<DependencyRule>) {
    const rules = runWhen.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    onChange({ ...runWhen, rules })
  }

  function addRule() {
    onChange({
      ...runWhen,
      rules: [
        ...runWhen.rules,
        { source: 'variable', path: '', op: 'exists' },
      ],
    })
  }

  function removeRule(index: number) {
    onChange({
      ...runWhen,
      rules: runWhen.rules.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('exec.dependencies')}</p>
          <p className="text-xs text-muted-foreground">{t('exec.dependenciesHelp')}</p>
        </div>
        <select
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          value={runWhen.logic}
          onChange={(event) =>
            onChange({ ...runWhen, logic: event.target.value === 'or' ? 'or' : 'and' })
          }
        >
          <option value="and">{t('exec.logicAnd')}</option>
          <option value="or">{t('exec.logicOr')}</option>
        </select>
      </div>

      {runWhen.rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {t('exec.noRules')}
        </p>
      ) : null}

      {runWhen.rules.map((rule, index) => (
        <div key={index} className="space-y-1.5 rounded-lg border border-border bg-background p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              value={rule.source}
              onChange={(event) =>
                updateRule(index, {
                  source: event.target.value as DependencyRule['source'],
                })
              }
            >
              <option value="variable">{t('exec.sourceVariable')}</option>
              <option value="dataset">{t('exec.sourceDataset')}</option>
              <option value="history">{t('exec.sourceHistory')}</option>
            </select>
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              value={rule.op}
              onChange={(event) => updateRule(index, { op: event.target.value as DependencyOp })}
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <Input
            className="h-9"
            value={rule.path}
            placeholder={
              rule.source === 'dataset'
                ? t('exec.pathDatasetPlaceholder')
                : rule.source === 'history'
                  ? t('exec.pathHistoryPlaceholder')
                  : t('exec.pathVariablePlaceholder')
            }
            onChange={(event) => updateRule(index, { path: event.target.value })}
          />
          {rule.op !== 'exists' &&
          rule.op !== 'empty' &&
          rule.op !== 'truthy' &&
          rule.op !== 'falsy' ? (
            <Input
              className="h-9"
              value={rule.value == null ? '' : String(rule.value)}
              placeholder={t('exec.compareValue')}
              onChange={(event) => updateRule(index, { value: event.target.value })}
            />
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive hover:text-destructive"
            onClick={() => removeRule(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('common.delete')}
          </Button>
        </div>
      ))}

      <Button size="sm" variant="outline" className="w-full" onClick={addRule}>
        <Plus className="h-3.5 w-3.5" />
        {t('exec.addRule')}
      </Button>
    </div>
  )
}
