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

const NO_TAB_HINT =
  'Open a normal website tab (http/https), click Pick, then click an element on any of those tabs. Use Cancel to exit.'

/**
 * Pick an element on any open website tab (multi-tab pick session).
 * Runtime plan clicks still use the Open URL tab via checkpoint.activeTabId.
 */
export function useElementPicker(_workflow?: unknown) {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPicked, setLastPicked] = useState<PickedElement | null>(null)

  const cancelPick = useCallback(async () => {
    try {
      await sendRuntimeMessage({ type: 'PICK_ELEMENT_STOP', payload: {} })
    } catch {
      // ignore — waiter may already be settled
    } finally {
      setPicking(false)
      setError(null)
    }
  }, [])

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
        if (lower.includes('cancelled')) {
          return null
        }
        if (
          lower.includes('chrome://') ||
          lower.includes('extension') ||
          lower.includes('cannot access') ||
          lower.includes('no tab') ||
          lower.includes('no normal website') ||
          lower.includes('content script') ||
          lower.includes('could not start')
        ) {
          throw new Error(`${raw} — ${NO_TAB_HINT}`)
        }
        throw new Error(raw)
      }

      setLastPicked(response.picked)
      return response.picked
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.toLowerCase().includes('cancelled')) {
        return null
      }
      setError(message)
      return null
    } finally {
      setPicking(false)
    }
  }, [])

  return {
    picking,
    error,
    lastPicked,
    pickElement,
    cancelPick,
    clearError: () => setError(null),
  }
}
