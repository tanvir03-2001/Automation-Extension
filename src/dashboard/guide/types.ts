import type { ActionCategory } from '@/planner/actions/types'
import type { AppLocale } from '@/shared/i18n/types'

export type SharedFeatureId =
  | 'test'
  | 'dependencies'
  | 'timeout'
  | 'onFailure'
  | 'preWait'
  | 'interaction'

export interface LocalizedText {
  en: string
  bn: string
}

export interface FeatureGuide {
  id: string
  title: LocalizedText
  what: LocalizedText
  why: LocalizedText
  how: LocalizedText
  example?: LocalizedText
}

export interface EventGuideOverride {
  whenWhy: LocalizedText
  example: LocalizedText
  /** Optional full how-to steps (replaces catalog / action-docs howto) */
  howto?: { en: string[]; bn: string[] }
  /** Extra feature cards beyond catalog fields + shared panels */
  features?: FeatureGuide[]
}

export interface BuiltFeatureGuide {
  id: string
  title: string
  what: string
  why: string
  how: string
  example?: string
  kind: 'shared' | 'field' | 'custom'
}

export interface BuiltEventGuide {
  actionId: string
  name: string
  category: ActionCategory
  description: string
  tooltip: string
  howto: string[]
  whenWhy: string
  example: string
  fields: BuiltFeatureGuide[]
  shared: BuiltFeatureGuide[]
  custom: BuiltFeatureGuide[]
  color: string
  icon: string
  supportsSelector?: boolean
  controlFlow?: boolean
}

export function pickLocale(text: LocalizedText, locale: AppLocale): string {
  return locale === 'bn' ? text.bn : text.en
}
