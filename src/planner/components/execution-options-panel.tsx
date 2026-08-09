import { Input } from '@/components/ui/input'
import { useT } from '@/shared/i18n/use-t'
import type {
  ErrorPolicy,
  InteractionOptions,
  PreWait,
} from '@/planner/types/plan'

interface ExecutionOptionsPanelProps {
  timeoutMs: number
  errorPolicy?: ErrorPolicy
  preWait?: PreWait
  interaction?: InteractionOptions
  onTimeoutChange: (ms: number) => void
  onErrorPolicyChange: (policy: ErrorPolicy) => void
  onPreWaitChange: (preWait: PreWait) => void
  onInteractionChange: (interaction: InteractionOptions) => void
}

const STRATEGIES: ErrorPolicy['strategy'][] = [
  'stop',
  'retry',
  'retry_forever',
  'ignore',
  'goto_step',
  'run_workflow',
  'recovery_workflow',
  'notify',
  'screenshot',
  'log',
]

const PRE_WAITS: PreWait['strategy'][] = [
  'none',
  'delay',
  'random',
  'network_idle',
  'dom_stable',
  'url',
  'element',
  'text',
]

export function ExecutionOptionsPanel({
  timeoutMs,
  errorPolicy,
  preWait,
  interaction,
  onTimeoutChange,
  onErrorPolicyChange,
  onPreWaitChange,
  onInteractionChange,
}: ExecutionOptionsPanelProps) {
  const t = useT()
  const policy: ErrorPolicy = {
    strategy: errorPolicy?.strategy ?? 'stop',
    maxRetries: errorPolicy?.maxRetries ?? 3,
    retryDelayMs: errorPolicy?.retryDelayMs ?? 1000,
    gotoStepId: errorPolicy?.gotoStepId,
    workflowId: errorPolicy?.workflowId,
    notifyMessage: errorPolicy?.notifyMessage,
  }
  const wait: PreWait = {
    strategy: preWait?.strategy ?? 'none',
    timeoutMs: preWait?.timeoutMs ?? 15_000,
    delayMs: preWait?.delayMs,
    minMs: preWait?.minMs,
    maxMs: preWait?.maxMs,
    urlContains: preWait?.urlContains,
    selector: preWait?.selector,
    text: preWait?.text,
    stableMs: preWait?.stableMs,
  }
  const ix: InteractionOptions = {
    scrollIntoView: interaction?.scrollIntoView ?? true,
    dismissOverlays: interaction?.dismissOverlays ?? false,
    waitEnabled: interaction?.waitEnabled ?? true,
    forceClick: interaction?.forceClick ?? false,
    stabilizeMs: interaction?.stabilizeMs ?? 0,
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('exec.title')}</p>
        <p className="text-xs text-muted-foreground">{t('exec.help')}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">{t('exec.timeout')}</span>
        <Input
          type="number"
          className="h-9"
          value={timeoutMs}
          min={100}
          onChange={(event) => onTimeoutChange(Math.max(100, Number(event.target.value) || 30_000))}
        />
      </label>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{t('exec.onFail')}</p>
        <select
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          value={policy.strategy}
          onChange={(event) =>
            onErrorPolicyChange({
              ...policy,
              strategy: event.target.value as ErrorPolicy['strategy'],
            })
          }
        >
          {STRATEGIES.map((strategy) => (
            <option key={strategy} value={strategy}>
              {strategy}
            </option>
          ))}
        </select>
        {(policy.strategy === 'retry' || policy.strategy === 'retry_forever') && (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t('exec.maxRetries')}</span>
              <Input
                type="number"
                className="h-9"
                value={policy.maxRetries}
                min={0}
                disabled={policy.strategy === 'retry_forever'}
                onChange={(event) =>
                  onErrorPolicyChange({
                    ...policy,
                    maxRetries: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t('exec.retryDelay')}</span>
              <Input
                type="number"
                className="h-9"
                value={policy.retryDelayMs}
                min={0}
                onChange={(event) =>
                  onErrorPolicyChange({
                    ...policy,
                    retryDelayMs: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
        )}
        {policy.strategy === 'goto_step' ? (
          <Input
            className="h-9"
            value={policy.gotoStepId ?? ''}
            placeholder={t('exec.gotoStepId')}
            onChange={(event) =>
              onErrorPolicyChange({ ...policy, gotoStepId: event.target.value })
            }
          />
        ) : null}
        {(policy.strategy === 'run_workflow' || policy.strategy === 'recovery_workflow') && (
          <Input
            className="h-9"
            value={policy.workflowId ?? ''}
            placeholder={t('exec.recoveryWorkflowId')}
            onChange={(event) =>
              onErrorPolicyChange({ ...policy, workflowId: event.target.value })
            }
          />
        )}
        {(policy.strategy === 'notify' || policy.strategy === 'log') && (
          <Input
            className="h-9"
            value={policy.notifyMessage ?? ''}
            placeholder={t('exec.notifyMessage')}
            onChange={(event) =>
              onErrorPolicyChange({ ...policy, notifyMessage: event.target.value })
            }
          />
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{t('exec.preWait')}</p>
        <select
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          value={wait.strategy}
          onChange={(event) =>
            onPreWaitChange({
              ...wait,
              strategy: event.target.value as PreWait['strategy'],
            })
          }
        >
          {PRE_WAITS.map((strategy) => (
            <option key={strategy} value={strategy}>
              {strategy}
            </option>
          ))}
        </select>
        {wait.strategy === 'delay' ? (
          <Input
            type="number"
            className="h-9"
            value={wait.delayMs ?? 500}
            onChange={(event) =>
              onPreWaitChange({ ...wait, delayMs: Number(event.target.value) || 0 })
            }
          />
        ) : null}
        {wait.strategy === 'random' ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              type="number"
              className="h-9"
              value={wait.minMs ?? 200}
              onChange={(event) =>
                onPreWaitChange({ ...wait, minMs: Number(event.target.value) || 0 })
              }
            />
            <Input
              type="number"
              className="h-9"
              value={wait.maxMs ?? 800}
              onChange={(event) =>
                onPreWaitChange({ ...wait, maxMs: Number(event.target.value) || 0 })
              }
            />
          </div>
        ) : null}
        {wait.strategy === 'url' ? (
          <Input
            className="h-9"
            value={wait.urlContains ?? ''}
            placeholder={t('exec.urlContains')}
            onChange={(event) => onPreWaitChange({ ...wait, urlContains: event.target.value })}
          />
        ) : null}
        {wait.strategy === 'element' ? (
          <Input
            className="h-9"
            value={wait.selector ?? ''}
            placeholder={t('exec.waitSelector')}
            onChange={(event) => onPreWaitChange({ ...wait, selector: event.target.value })}
          />
        ) : null}
        {wait.strategy === 'text' ? (
          <Input
            className="h-9"
            value={wait.text ?? ''}
            placeholder={t('exec.waitText')}
            onChange={(event) => onPreWaitChange({ ...wait, text: event.target.value })}
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{t('exec.interaction')}</p>
        {(
          [
            ['scrollIntoView', t('exec.scrollIntoView')],
            ['dismissOverlays', t('exec.dismissOverlays')],
            ['waitEnabled', t('exec.waitEnabled')],
            ['forceClick', t('exec.forceClick')],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={Boolean(ix[key])}
              onChange={(event) =>
                onInteractionChange({ ...ix, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t('exec.stabilizeMs')}</span>
          <Input
            type="number"
            className="h-9"
            value={ix.stabilizeMs}
            min={0}
            onChange={(event) =>
              onInteractionChange({
                ...ix,
                stabilizeMs: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>
      </div>
    </div>
  )
}
