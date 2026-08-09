import { useCallback, useState } from 'react'
import { sendRuntimeMessage } from '@/shared/messaging/bus'

export interface PickedElement {
  selector: string
  fallbacks?: string[]
  strategy?: string
  tagName: string
  text: string
  attributes: Record<string, string>
}

const ACTIVE_TAB_HINT =
  'Focus a normal website tab first (not chrome:// or the extension page), then pick again.'

/**
 * Pick an element on the currently active browser tab.
 * Does not open ChatGPT or any workflow URL hint.
 */
export function useElementPicker(_workflow?: unknown) {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPicked, setLastPicked] = useState<PickedElement | null>(null)

  const pickElement = useCallback(async (): Promise<PickedElement | null> => {
    setError(null)
    setPicking(true)

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
        const raw = response.error ?? 'Element pick failed'
        const lower = raw.toLowerCase()
        if (
          lower.includes('chrome://') ||
          lower.includes('extension') ||
          lower.includes('cannot access') ||
          lower.includes('no tab') ||
          lower.includes('content script')
        ) {
          throw new Error(`${raw} — ${ACTIVE_TAB_HINT}`)
        }
        throw new Error(raw)
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
  }, [])

  return { picking, error, lastPicked, pickElement, clearError: () => setError(null) }
}
