import {
  getActionById,
  ACTION_LIBRARY,
} from '@/planner/actions/catalog'
import {
  getActionHowto,
  getActionTooltip,
} from '@/planner/actions/action-docs'
import type { ActionDefinition, ActionField } from '@/planner/actions/types'
import { ACTION_BN } from '@/shared/i18n/actions-bn'
import type { AppLocale } from '@/shared/i18n/types'

function localizeFields(
  fields: ActionField[],
  localeFields?: Record<string, { label?: string; help?: string; placeholder?: string }>,
): ActionField[] {
  if (!localeFields) return fields
  return fields.map((field) => {
    const tr = localeFields[field.key]
    if (!tr) return field
    return {
      ...field,
      label: tr.label ?? field.label,
      help: tr.help ?? field.help,
      placeholder: tr.placeholder ?? field.placeholder,
      options: field.options?.map((opt) => {
        // Option labels stay English unless we add value-keyed maps later
        return opt
      }),
    }
  })
}

/** Return action definition with localized name/description/tooltip/howto/fields. */
export function localizeAction(
  action: ActionDefinition | string | undefined | null,
  locale: AppLocale,
): ActionDefinition | null {
  const def =
    typeof action === 'string'
      ? getActionById(action) ?? ACTION_LIBRARY.find((item) => item.id === action)
      : action
  if (!def) return null

  const tooltip = getActionTooltip(def)
  const howto = getActionHowto(def)

  if (locale !== 'bn') {
    return {
      ...def,
      tooltip,
      howto,
    }
  }

  const tr = ACTION_BN[def.id]
  if (!tr) {
    return {
      ...def,
      tooltip,
      howto,
    }
  }

  return {
    ...def,
    name: tr.name,
    description: tr.description,
    tooltip: tr.tooltip ?? tr.description,
    howto: tr.howto?.length ? tr.howto : howto,
    fields: localizeFields(def.fields, tr.fields),
  }
}

export function getLocalizedActionDocs(
  actionId: string,
  locale: AppLocale,
): {
  action: ActionDefinition
  tooltip: string
  howto: string[]
  fields: ActionField[]
} | null {
  const localized = localizeAction(actionId, locale)
  if (!localized) return null
  return {
    action: localized,
    tooltip: localized.tooltip ?? localized.description,
    howto: localized.howto?.length
      ? localized.howto
      : getActionHowto(localized),
    fields: localized.fields,
  }
}

export function localizedActionName(
  actionId: string,
  locale: AppLocale,
  fallback?: string,
): string {
  return localizeAction(actionId, locale)?.name ?? fallback ?? actionId
}

/**
 * Show translated action name when the node still uses the default English catalog name.
 * Custom / pick-based labels stay as the user set them.
 */
export function displayNodeActionLabel(
  dataLabel: string,
  actionId: string,
  locale: AppLocale,
): string {
  const english = getActionById(actionId)
  const localized = localizeAction(actionId, locale)
  if (!english || !localized) return dataLabel
  if (dataLabel === english.name || !dataLabel.trim()) return localized.name
  return dataLabel
}
