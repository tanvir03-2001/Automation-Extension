import type { z } from 'zod'

export type ActionCategory =
  | 'browser'
  | 'mouse'
  | 'keyboard'
  | 'input'
  | 'element'
  | 'clipboard'
  | 'storage'
  | 'variables'
  | 'conditions'
  | 'loops'
  | 'data'
  | 'downloads'
  | 'upload'
  | 'ai'
  | 'wait'
  | 'screenshot'
  | 'logging'
  | 'flow'
  | 'error'

export type ActionFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'selector'
  | 'json'
  | 'url'
  | 'key'
  | 'nodeRef'

export interface ActionField {
  key: string
  label: string
  type: ActionFieldType
  required?: boolean
  placeholder?: string
  defaultValue?: unknown
  options?: Array<{ label: string; value: string }>
  help?: string
}

export interface ActionDefinition {
  id: string
  name: string
  category: ActionCategory
  description: string
  /** Short plain-English hover tip */
  tooltip?: string
  /** Longer steps shown in the docs drawer */
  howto?: string[]
  icon: string
  color: string
  fields: ActionField[]
  supportsSelector?: boolean
  controlFlow?: boolean
  favoriteDefault?: boolean
}

export type ActionHandlerResult = {
  status: 'success' | 'failed' | 'timeout' | 'waiting' | 'skipped'
  output?: unknown
  variables?: Record<string, unknown>
  activeTabId?: number
  nextNodeId?: string | null
  branch?: string
  error?: string
}

export type ActionHandler = (args: {
  params: Record<string, unknown>
  variables: Record<string, unknown>
  activeTabId?: number
  timeoutMs: number
  selector?: string
}) => Promise<ActionHandlerResult>

export type ActionSchemaMap = Record<string, z.ZodTypeAny>
