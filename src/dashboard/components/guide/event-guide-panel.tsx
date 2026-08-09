import { useMemo, type ReactNode } from 'react'
import {
  BookOpen,
  Lightbulb,
  ListOrdered,
  MousePointerClick,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CategoryDemo } from '@/dashboard/components/guide/category-demo'
import { buildEventGuide } from '@/dashboard/guide/build-event-guide'
import type { BuiltFeatureGuide } from '@/dashboard/guide/types'
import { ActionIcon } from '@/planner/components/action-icons'
import { useLocale, useT } from '@/shared/i18n/use-t'
import { cn } from '@/shared/utils/cn'

interface EventGuidePanelProps {
  actionId: string
  onClose?: () => void
  showClose?: boolean
  className?: string
}

export function EventGuidePanel({
  actionId,
  onClose,
  showClose = false,
  className,
}: EventGuidePanelProps) {
  const t = useT()
  const locale = useLocale()
  const guide = useMemo(
    () => buildEventGuide(actionId, locale),
    [actionId, locale],
  )

  if (!guide) {
    return (
      <div className={cn('flex h-full items-center p-6', className)}>
        <p className="text-sm text-muted-foreground">{t('guide.pickEvent')}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-card text-card-foreground', className)}>
      <div className="shrink-0 border-b border-border p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground shadow-md"
            style={{ background: guide.color }}
          >
            <ActionIcon name={guide.icon} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t('guide.propertiesLabel')}
            </p>
            <h2 className="font-display text-2xl font-semibold leading-tight">
              {guide.name}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {guide.actionId}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{t('cat.' + guide.category)}</Badge>
              {guide.supportsSelector ? (
                <Badge variant="outline">{t('docs.supportsPick')}</Badge>
              ) : null}
              {guide.controlFlow ? (
                <Badge variant="outline">{t('docs.flowControl')}</Badge>
              ) : null}
            </div>
          </div>
          {showClose && onClose ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-lg p-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="mt-4">
          <CategoryDemo category={guide.category} />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <GuideBlock
            icon={<Lightbulb className="h-3.5 w-3.5 text-primary" />}
            title={t('guide.whenWhy')}
            body={guide.whenWhy}
          />
          <GuideBlock
            icon={<BookOpen className="h-3.5 w-3.5 text-primary" />}
            title={t('docs.plainEnglish')}
            body={guide.tooltip}
          />
          <GuideBlock
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            title={t('guide.example')}
            body={guide.example}
            accent
          />

          {guide.howto.length ? (
            <section>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <ListOrdered className="h-3.5 w-3.5 text-primary" />
                {t('docs.howToUse')}
              </p>
              <ol className="space-y-2">
                {guide.howto.map((step, index) => (
                  <li
                    key={index}
                    className="flex gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs leading-relaxed"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {guide.custom.length ? (
            <FeatureSection
              title={t('guide.eventFeatures')}
              features={guide.custom}
            />
          ) : null}

          {guide.fields.length ? (
            <FeatureSection title={t('guide.fields')} features={guide.fields} />
          ) : null}

          <FeatureSection
            title={t('guide.sharedFeatures')}
            features={guide.shared}
            help={t('guide.sharedHelp')}
          />

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('guide.tip')}
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}

function GuideBlock({
  icon,
  title,
  body,
  accent,
}: {
  icon: ReactNode
  title: string
  body: string
  accent?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border p-3',
        accent
          ? 'border-primary/25 bg-primary/5'
          : 'border-border bg-muted/30',
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
        {icon}
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  )
}

function FeatureSection({
  title,
  features,
  help,
}: {
  title: string
  features: BuiltFeatureGuide[]
  help?: string
}) {
  if (!features.length) return null
  return (
    <section>
      <p className="mb-1 text-xs font-semibold">{title}</p>
      {help ? <p className="mb-2 text-[11px] text-muted-foreground">{help}</p> : null}
      <div className="space-y-2">
        {features.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: BuiltFeatureGuide }) {
  const t = useT()
  return (
    <details className="group rounded-xl border border-border bg-background open:bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{feature.title}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {feature.kind === 'shared'
              ? t('guide.kindShared')
              : feature.kind === 'field'
                ? t('guide.kindField')
                : t('guide.kindFeature')}
          </Badge>
        </span>
      </summary>
      <div className="space-y-2 border-t border-border/70 px-3 py-3 text-xs leading-relaxed">
        <FeatureLine label={t('guide.what')} text={feature.what} />
        <FeatureLine label={t('guide.why')} text={feature.why} />
        <FeatureLine label={t('guide.how')} text={feature.how} />
        {feature.example ? (
          <FeatureLine label={t('guide.example')} text={feature.example} />
        ) : null}
      </div>
    </details>
  )
}

function FeatureLine({ label, text }: { label: string; text: string }) {
  return (
    <p>
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="text-muted-foreground">{text}</span>
    </p>
  )
}
