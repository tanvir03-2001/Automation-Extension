import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({
  defaultRootFolder: z.string().min(1, 'Required'),
  defaultProjectName: z.string().min(1, 'Required'),
  maxRetries: z.coerce.number().int().min(0).max(20),
})

type FormValues = z.infer<typeof schema>

export function SettingsView() {
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
