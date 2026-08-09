/**
 * Action handler registry - canonical IDs + aliases.
 * Execution still lives in action-executor.ts; this module is the
 * single source of truth for resolution used by palette, docs, and runner.
 */
import { ACTION_ALIASES, resolveActionAlias } from '@/planner/engine/action-aliases'
import { ACTION_LIBRARY, getActionById } from '@/planner/actions/catalog'
import type { ActionDefinition } from '@/planner/actions/types'

export { ACTION_ALIASES, resolveActionAlias }

/** Resolve definition for an action id, following aliases when needed. */
export function resolveActionDefinition(actionId: string): ActionDefinition | undefined {
  const direct = getActionById(actionId)
  if (direct) return direct
  const { actionId: canonical } = resolveActionAlias(actionId)
  if (canonical === actionId) return undefined
  return getActionById(canonical)
}

export function listCanonicalActionIds(): string[] {
  const aliases = new Set(Object.keys(ACTION_ALIASES))
  return ACTION_LIBRARY.map((a) => a.id).filter((id) => !aliases.has(id))
}
