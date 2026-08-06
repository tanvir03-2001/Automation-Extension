import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Crosshair, ExternalLink, MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendRuntimeMessage } from '@/shared/messaging/bus'

interface PickedElement {
  selector: string
  tagName: string
  text: string
  attributes: Record<string, string>
}

export function SelectorLabView() {
  const [url, setUrl] = useState('https://chatgpt.com/')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedElement | null>(null)
  const [copied, setCopied] = useState(false)

  async function openTargetSite() {
    setError(null)
    await sendRuntimeMessage({
      type: 'OPEN_URL',
      payload: { url },
    })
  }

  async function pickElement() {
    setError(null)
    setPicking(true)
    setCopied(false)
    try {
      const opened = await sendRuntimeMessage<{ ok: boolean; tabId?: number }>({
        type: 'OPEN_URL',
        payload: { url },
      })

      const response = await sendRuntimeMessage<{
        ok: boolean
        picked?: PickedElement
        error?: string
      }>({
        type: 'PICK_ELEMENT_START',
        payload: { urlHint: url, tabId: opened.tabId },
      })

      if (!response.ok || !response.picked) {
        throw new Error(response.error ?? 'Pick failed')
      }

      setPicked(response.picked)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPicking(false)
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
          প্রথমে সাইট খুলুন, তারপর পেজের বাটনে ক্লিক করে সঠিক CSS selector নিন। সেই selector
          workflow step-এর <span className="font-mono">params.selector</span> ফিল্ডে বসান।
        </p>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-panel"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Target URL</label>
          <Input value={url} onChange={(event) => setUrl(event.target.value)} />
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
            {picking ? 'Click an element on the page…' : '2. Pick button / input'}
          </Button>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ChatGPT-এ Send বাটন বা prompt box-এ ক্লিক করলে selector এখানে আসবে। Esc চাপলে cancel।
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
              এখন Workflows → ChatGPT step-এর <span className="font-mono">params.selector</span>{' '}
              হিসেবে এটা ব্যবহার করুন।
            </p>
          </div>
        ) : null}
      </motion.section>

      <section className="rounded-2xl border border-border/80 bg-card p-5">
        <h2 className="font-display text-lg font-semibold">ChatGPT ডিফল্ট selectors</h2>
        <div className="mt-3 space-y-2 font-mono text-xs">
          <p>
            Prompt:{' '}
            <span className="text-muted-foreground">
              #prompt-textarea, div[contenteditable=&quot;true&quot;]
            </span>
          </p>
          <p>
            Send button:{' '}
            <span className="text-muted-foreground">
              button[data-testid=&quot;send-button&quot;], button[aria-label*=&quot;Send&quot;]
            </span>
          </p>
        </div>
      </section>
    </div>
  )
}
