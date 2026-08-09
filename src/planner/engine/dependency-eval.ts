import { getByPath } from '@/planner/engine/path-utils'
import type { EventContext } from '@/planner/engine/event-context'
import type { DependencyRule, RunWhen } from '@/planner/types/plan'

export interface RuleEvalResult {
  rule: DependencyRule
  left: unknown
  passed: boolean
  error?: string
}

export interface DependencyEvalResult {
  enabled: boolean
  logic: 'and' | 'or'
  passed: boolean
  rules: RuleEvalResult[]
}

function resolveLeft(ctx: EventContext, rule: DependencyRule): unknown {
  const path = rule.path.trim()
  if (rule.source === 'variable') {
    return ctx.getVar(path)
  }
  if (rule.source === 'dataset') {
    // path: "DatasetName" or "DatasetName.nested.path" or "ds_xxx.nested"
    const [head, ...rest] = path.split('.')
    if (!head) return undefined
    return ctx.getDataset(head, rest.join('.'))
  }
  // history: "last.status" | "last.error" | "last.output..." | "length"
  const historyView = {
    last: ctx.history[ctx.history.length - 1] ?? null,
    length: ctx.history.length,
  }
  return getByPath(historyView, path || 'last')
}

function compare(op: DependencyRule['op'], left: unknown, right: unknown): boolean {
  switch (op) {
    case 'exists':
      return left !== undefined && left !== null
    case 'empty': {
      if (left == null) return true
      if (typeof left === 'string') return left.trim().length === 0
      if (Array.isArray(left)) return left.length === 0
      if (typeof left === 'object') return Object.keys(left as object).length === 0
      return false
    }
    case 'truthy':
      return Boolean(left)
    case 'falsy':
      return !left
    case 'eq':
      return String(left ?? '') === String(right ?? '')
    case 'neq':
      return String(left ?? '') !== String(right ?? '')
    case 'contains':
      return String(left ?? '').includes(String(right ?? ''))
    case 'gt':
      return Number(left) > Number(right)
    case 'gte':
      return Number(left) >= Number(right)
    case 'lt':
      return Number(left) < Number(right)
    case 'lte':
      return Number(left) <= Number(right)
    default:
      return false
  }
}

export function evaluateRunWhen(
  ctx: EventContext,
  runWhen?: RunWhen | null,
): DependencyEvalResult {
  if (!runWhen || !runWhen.rules?.length) {
    return { enabled: false, logic: 'and', passed: true, rules: [] }
  }

  const logic = runWhen.logic === 'or' ? 'or' : 'and'
  const rules: RuleEvalResult[] = runWhen.rules.map((rule) => {
    try {
      const left = resolveLeft(ctx, rule)
      const passed = compare(rule.op, left, rule.value)
      return { rule, left, passed }
    } catch (error) {
      return {
        rule,
        left: undefined,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  const passed =
    logic === 'and' ? rules.every((item) => item.passed) : rules.some((item) => item.passed)

  return { enabled: true, logic, passed, rules }
}
