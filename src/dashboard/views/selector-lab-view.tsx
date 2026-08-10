import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Crosshair, ExternalLink, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendRuntimeMessage } from '@/shared/messaging/bus'

interface PickedElement {
  selector: string
  fallbacks?: string[]
  tagName: string
  text: string
  attributes: Record<string, string>
}

export function SelectorLabView() {
  const [url, setUrl] = useState('https://example.com')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedElement | null>(null)
  const [copied, setCopied] = useState(false)

  async function openTargetSite() {
    setError(null)
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Enter a website URL first, or open a website tab and pick on any page.')
      return
    }
    await sendRuntimeMessage({
      type: 'OPEN_URL',
      payload: { url: trimmed },
    })
  }

  /** Pick on any open website tab (first click wins). */
  async function pickElement() {
    setError(null)
    setPicking(true)
    setCopied(false)
    try {
      const response = await sendRuntimeMessage<{
        ok: boolean
        picked?: PickedElement
        error?: string
      }>({
        type: 'PICK_ELEMENT_START',
        payload: {},
      })

      if (!response.ok || !response.picked) {
        const raw = response.error ?? 'Pick failed'
        if (raw.toLowerCase().includes('cancelled')) return
        throw new Error(
          `${raw}. Open a normal website tab, then try again.`,
        )
      }

      setPicked(response.picked)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.toLowerCase().includes('cancelled')) return
      setError(message)
    } finally {
      setPicking(false)
    }
  }

  async function cancelPick() {
    try {
      await sendRuntimeMessage({ type: 'PICK_ELEMENT_STOP', payload: {} })
    } catch {
      // ignore
    } finally {
      setPicking(false)
      setError(null)
    }
  }

  async function copySelector() {
    if (!picked?.selector) return
    await navigator.clipboard.writeText(picked.selector)
    setCopied(true)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Selector Lab</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Works on any website. Optionally open a URL, then pick on{' '}
          <strong>any open</strong> website tab. Use the selector in a planner step&apos;s Properties.
        </p>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-panel"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Optional: open URL</label>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void openTargetSite()}>
            <ExternalLink className="h-4 w-4" />
            1. Open website
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={picking}
            onClick={() => void pickElement()}
          >
            <Crosshair className="h-4 w-4" />
            {picking ? 'Click an element on any tab…' : '2. Pick on any tab'}
          </Button>
          {picking ? (
            <Button type="button" variant="outline" onClick={() => void cancelPick()}>
              Cancel
            </Button>
          ) : null}
        </div>

        <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Pick starts on every open website tab — click an element on the tab you want. Esc or
            Cancel exits. Primary selector and fallbacks are captured for reliable targeting.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        {picked ? (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Selected element</p>
              <Button size="sm" variant="outline" onClick={() => void copySelector()}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy selector'}
              </Button>
            </div>
            <code className="block break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">
              {picked.selector}
            </code>
            {(picked.fallbacks?.length ?? 0) > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Fallbacks</p>
                {picked.fallbacks!.map((item) => (
                  <code
                    key={item}
                    className="block break-all rounded-lg bg-background px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {item}
                  </code>
                ))}
              </div>
            ) : null}
            <div className="grid gap-1 text-xs text-muted-foreground">
              <p>
                Tag: <span className="font-mono text-foreground">{picked.tagName}</span>
              </p>
              {picked.text ? (
                <p>
                  Text: <span className="text-foreground">{picked.text}</span>
                </p>
              ) : null}
              {Object.entries(picked.attributes).map(([key, value]) => (
                <p key={key}>
                  {key}: <span className="font-mono text-foreground">{value}</span>
                </p>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Paste into a planner step Properties → selector (or use Pick with mouse there).
            </p>
          </div>
        ) : null}
      </motion.section>
    </div>
  )
}
