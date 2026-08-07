import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePlannerStore } from '@/planner/store/planner-store'

const schema = z.object({
  defaultRootFolder: z.string().min(1, 'Required'),
  defaultProjectName: z.string().min(1, 'Required'),
  maxRetries: z.coerce.number().int().min(0).max(20),
})

type FormValues = z.infer<typeof schema>

export function SettingsView() {
  const theme = usePlannerStore((s) => s.theme)
  const setTheme = usePlannerStore((s) => s.setTheme)

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
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Global defaults for downloads, projects, and retry behavior. Validated with Zod.
        </p>
      </header>

      <section className="max-w-lg space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-panel">
        <div>
          <p className="text-sm font-medium">Appearance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Applies across Dashboard, Workflow Planner, and overlays. No layout shift.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={theme === 'light' ? 'default' : 'outline'}
            onClick={() => setTheme('light')}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </Button>
          <Button
            type="button"
            size="sm"
            variant={theme === 'dark' ? 'default' : 'outline'}
            onClick={() => setTheme('dark')}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </Button>
        </div>
      </section>

      <form
        className="max-w-lg space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-panel"
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Default root folder</span>
          <Input {...form.register('defaultRootFolder')} />
          {form.formState.errors.defaultRootFolder ? (
            <span className="text-xs text-destructive">
              {form.formState.errors.defaultRootFolder.message}
            </span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Default project name</span>
          <Input {...form.register('defaultProjectName')} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Max retries</span>
          <Input type="number" {...form.register('maxRetries')} />
        </label>

        <Button type="submit">Save defaults</Button>
      </form>
    </div>
  )
}
