import { useMemo } from 'react'
import { createT } from '@/shared/i18n'
import { usePlannerStore } from '@/planner/store/planner-store'

/** Reactive translator bound to the current UI locale. */
export function useT() {
  const locale = usePlannerStore((s) => s.locale)
  return useMemo(() => createT(locale), [locale])
}

export function useLocale() {
  return usePlannerStore((s) => s.locale)
}
