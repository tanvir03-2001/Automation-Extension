import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePlannerStore } from '@/planner/store/planner-store'
import { useT } from '@/shared/i18n/use-t'

export function SettingsView() {
  const t = useT()
  const theme = usePlannerStore((s) => s.theme)
  const setTheme = usePlannerStore((s) => s.setTheme)
  const locale = usePlannerStore((s) => s.locale)
  const setLocale = usePlannerStore((s) => s.setLocale)

  const schema = z.object({
    defaultRootFolder: z.string().min(1, t('settings.required')),
    defaultProjectName: z.string().min(1, t('settings.required')),
    maxRetries: z.coerce.number().int().min(0).max(20),
  })

  type FormValues = z.infer<typeof schema>

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultRootFolder: 'AutomationEngine',
      defaultProjectName: 'demo-project',
      maxRetries: 3,
    },
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </header>

      <section className="max-w-lg space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-panel">
        <div>
          <p className="text-sm font-medium">{t('lang.section')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('lang.help')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={locale === 'en' ? 'default' : 'outline'}
            onClick={() => setLocale('en')}
          >
            {t('lang.english')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={locale === 'bn' ? 'default' : 'outline'}
            onClick={() => setLocale('bn')}
          >
            {t('lang.bangla')}
          </Button>
        </div>
      </section>

      <section className="max-w-lg space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-panel">
        <div>
          <p className="text-sm font-medium">{t('theme.section')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('theme.help')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={theme === 'light' ? 'default' : 'outline'}
            onClick={() => setTheme('light')}
          >
            <Sun className="h-3.5 w-3.5" />
            {t('theme.lightShort')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={theme === 'dark' ? 'default' : 'outline'}
            onClick={() => setTheme('dark')}
          >
            <Moon className="h-3.5 w-3.5" />
            {t('theme.darkShort')}
          </Button>
        </div>
      </section>

      <form
        className="max-w-lg space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-panel"
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('settings.rootFolder')}</span>
          <Input {...form.register('defaultRootFolder')} />
          {form.formState.errors.defaultRootFolder ? (
            <span className="text-xs text-destructive">
              {form.formState.errors.defaultRootFolder.message}
            </span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('settings.projectName')}</span>
          <Input {...form.register('defaultProjectName')} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('settings.maxRetries')}</span>
          <Input type="number" {...form.register('maxRetries')} />
        </label>

        <Button type="submit">{t('settings.saveDefaults')}</Button>
      </form>
    </div>
  )
}
