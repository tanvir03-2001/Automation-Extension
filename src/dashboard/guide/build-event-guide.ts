import {
  ACTION_CATEGORIES,
  ACTION_LIBRARY,
  searchActions,
} from '@/planner/actions/catalog'
import type { ActionCategory, ActionDefinition } from '@/planner/actions/types'
import { localizeAction } from '@/shared/i18n/action-locale'
import type { AppLocale } from '@/shared/i18n/types'
import { EVENT_GUIDE_OVERRIDES } from '@/dashboard/guide/event-overrides'
import {
  CATEGORIES_WITH_INTERACTION,
  SHARED_FEATURE_ORDER,
  SHARED_FEATURES,
} from '@/dashboard/guide/shared-features'
import {
  pickLocale,
  type BuiltEventGuide,
  type BuiltFeatureGuide,
} from '@/dashboard/guide/types'

function defaultWhenWhy(action: ActionDefinition, locale: AppLocale): string {
  if (locale === 'bn') {
    return `${action.name} ইভেন্টটি ${action.description} - প্ল্যানারে টেনে এনে Properties থেকে সেটআপ করুন।`
  }
  return `Use ${action.name} when you need to: ${action.description}. Drag it onto the planner and configure it in Properties.`
}

function defaultExample(action: ActionDefinition, locale: AppLocale): string {
  if (locale === 'bn') {
    return `Start → … → ${action.name} → পরের স্টেপ। প্রয়োজনে Dependencies / Execution অপশন সেট করে Test চালান।`
  }
  return `Start → … → ${action.name} → next step. Set Dependencies / Execution if needed, then Run test.`
}

function fieldWhy(locale: AppLocale): string {
  return locale === 'bn'
    ? 'এই ফিল্ড ছাড়া ইভেন্ট সঠিক টার্গেট বা মান পায় না।'
    : 'Without this field the event cannot target the right element or value.'
}

function fieldHow(label: string, locale: AppLocale): string {
  return locale === 'bn'
    ? `Properties-এ “${label}” পূরণ করুন। সিলেক্টর হলে Pick with mouse ব্যবহার করুন।`
    : `Fill “${label}” in Properties. For selectors, prefer Pick with mouse.`
}

function buildShared(locale: AppLocale, category: ActionCategory): BuiltFeatureGuide[] {
  const ids = SHARED_FEATURE_ORDER.filter((id) => {
    if (id === 'interaction') return CATEGORIES_WITH_INTERACTION.has(category)
    return true
  })
  // Flow start/end still get test + dependencies; skip heavy execution for pure markers? Keep all for consistency except interaction.
  return ids.map((id) => {
    const f = SHARED_FEATURES[id]
    return {
      id: f.id,
      title: pickLocale(f.title, locale),
      what: pickLocale(f.what, locale),
      why: pickLocale(f.why, locale),
      how: pickLocale(f.how, locale),
      example: f.example ? pickLocale(f.example, locale) : undefined,
      kind: 'shared' as const,
    }
  })
}

export function buildEventGuide(
  actionId: string,
  locale: AppLocale,
): BuiltEventGuide | null {
  const localized = localizeAction(actionId, locale)
  if (!localized) return null

  const override = EVENT_GUIDE_OVERRIDES[actionId]
  const fields: BuiltFeatureGuide[] = localized.fields.map((field) => ({
    id: `field:${field.key}`,
    title: field.label,
    what:
      field.help ??
      (locale === 'bn'
        ? `${field.label} ফিল্ড (${field.type})।`
        : `${field.label} field (${field.type}).`),
    why: fieldWhy(locale),
    how: fieldHow(field.label, locale),
    example: field.placeholder
      ? locale === 'bn'
        ? `উদাহরণ মান: ${field.placeholder}`
        : `Example value: ${field.placeholder}`
      : undefined,
    kind: 'field' as const,
  }))

  const custom: BuiltFeatureGuide[] = (override?.features ?? []).map((f) => ({
    id: f.id,
    title: pickLocale(f.title, locale),
    what: pickLocale(f.what, locale),
    why: pickLocale(f.why, locale),
    how: pickLocale(f.how, locale),
    example: f.example ? pickLocale(f.example, locale) : undefined,
    kind: 'custom' as const,
  }))

  // Prefer custom feature cards when they already cover the same topic as a field (e.g. selector).
  const customIds = new Set(custom.map((c) => c.id))
  const filteredFields = fields.filter((f) => {
    const key = f.id.replace(/^field:/, '')
    return !customIds.has(key) && !customIds.has(f.id)
  })

  return {
    actionId: localized.id,
    name: localized.name,
    category: localized.category,
    description: localized.description,
    tooltip: localized.tooltip ?? localized.description,
    howto: override?.howto
      ? locale === 'bn'
        ? override.howto.bn
        : override.howto.en
      : (localized.howto ?? []),
    whenWhy: override
      ? pickLocale(override.whenWhy, locale)
      : defaultWhenWhy(localized, locale),
    example: override
      ? pickLocale(override.example, locale)
      : defaultExample(localized, locale),
    fields: filteredFields,
    shared: buildShared(locale, localized.category),
    custom,
    color: localized.color,
    icon: localized.icon,
    supportsSelector: localized.supportsSelector,
    controlFlow: localized.controlFlow,
  }
}

export function listGuideActions(locale: AppLocale): ActionDefinition[] {
  const localized = ACTION_LIBRARY.map((action) => localizeAction(action, locale)!).filter(
    Boolean,
  )
  return searchActions('', localized)
}

export function groupGuideActions(
  locale: AppLocale,
): Array<{ category: ActionCategory; actions: ActionDefinition[] }> {
  const actions = listGuideActions(locale)
  return ACTION_CATEGORIES.map((category) => ({
    category,
    actions: actions.filter((a) => a.category === category),
  })).filter((group) => group.actions.length > 0)
}
