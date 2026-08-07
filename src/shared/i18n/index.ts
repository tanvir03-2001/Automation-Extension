import { en } from '@/shared/i18n/messages-en'
import { bn } from '@/shared/i18n/messages-bn'
import type { AppLocale, MessageDict } from '@/shared/i18n/types'

export type { AppLocale, MessageDict } from '@/shared/i18n/types'

const dictionaries: Record<AppLocale, MessageDict> = { en, bn }

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] === undefined || params[key] === null ? '' : String(params[key]),
  )
}

/** Translate a key. Falls back to English, then optional fallback, then the key. */
export function translate(
  locale: AppLocale,
  key: string,
  paramsOrFallback?: Record<string, string | number> | string,
  params?: Record<string, string | number>,
): string {
  let fallback: string | undefined
  let vars: Record<string, string | number> | undefined
  if (typeof paramsOrFallback === 'string') {
    fallback = paramsOrFallback
    vars = params
  } else {
    vars = paramsOrFallback
  }

  const raw =
    dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? fallback ?? key
  return interpolate(raw, vars)
}

export function createT(locale: AppLocale) {
  return (
    key: string,
    paramsOrFallback?: Record<string, string | number> | string,
    params?: Record<string, string | number>,
  ) => translate(locale, key, paramsOrFallback, params)
}

export type TFunction = ReturnType<typeof createT>
