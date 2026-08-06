import { useCallback, useState } from 'react'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import type { VisualWorkflow } from '@/planner/types/plan'

export interface PickedElement {
  selector: string
  fallbacks?: string[]
  strategy?: string
  tagName: string
  text: string
  attributes: Record<string, string>
}

function resolveUrlHint(workflow?: VisualWorkflow | null): string {
  if (!workflow) return 'https://chatgpt.com/'

  for (const node of workflow.nodes) {
    const url = node.data.params.url
    if (typeof url === 'string' && url.startsWith('http')) return url
    if (node.data.actionId.includes('chatgpt')) return 'https://chatgpt.com/'
    if (node.data.actionId.includes('claude')) return 'https://claude.ai'
    if (node.data.actionId.includes('gemini')) return 'https://gemini.google.com'
    if (node.data.actionId.includes('grok')) return 'https://grok.com'
  }

  return 'https://chatgpt.com/'
}

export function useElementPicker(workflow?: VisualWorkflow | null) {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPicked, setLastPicked] = useState<PickedElement | null>(null)

  const pickElement = useCallback(async (): Promise<PickedElement | null> => {
    setError(null)
    setPicking(true)
    const urlHint = resolveUrlHint(workflow)

    try {
      const opened = await sendRuntimeMessage<{ ok: boolean; tabId?: number; error?: string }>({
        type: 'OPEN_URL',
        payload: { url: urlHint },
      })

      const tabId = opened.tabId

      const response = await sendRuntimeMessage<{
        ok: boolean
        picked?: PickedElement
        error?: string
      }>({
        type: 'PICK_ELEMENT_START',
        payload: { urlHint, tabId },
      })

      if (!response.ok || !response.picked) {
        throw new Error(response.error ?? 'Element pick failed')
      }

      setLastPicked(response.picked)
      return response.picked
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    } finally {
      setPicking(false)
    }
  }, [workflow])

  return { picking, error, lastPicked, pickElement, clearError: () => setError(null) }
}
