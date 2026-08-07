export type ActionFieldLocale = {
  label?: string
  help?: string
  placeholder?: string
}

export type ActionLocaleEntry = {
  name: string
  description: string
  tooltip?: string
  howto?: string[]
  fields?: Record<string, ActionFieldLocale>
}
