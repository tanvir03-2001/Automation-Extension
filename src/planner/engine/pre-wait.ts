import { sleep } from '@/engine/retry/retry-policy'
import { ensureContentScript } from '@/background/ensure-content-script'
import { sendTabMessage } from '@/shared/messaging/bus'
import type { PreWait } from '@/planner/types/plan'
import type { AutomationCommand } from '@/shared/types/messages'

export interface PreWaitResult {
  strategy: PreWait['strategy']
  elapsedMs: number
  skipped: boolean
  detail?: string
}

async function runDom(
  tabId: number,
  command: AutomationCommand,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  await ensureContentScript(tabId)
  return sendTabMessage(tabId, { type: 'AUTOMATION_COMMAND', payload: command })
}

async function requireWorkingTab(activeTabId: number | undefined, label: string): Promise<number> {
  if (activeTabId != null) {
    try {
      await chrome.tabs.get(activeTabId)
      return activeTabId
    } catch {
      throw new Error(
        `${label}: working tab is gone. Re-run Open URL, or for Event Test focus the target website tab.`,
      )
    }
  }
  throw new Error(
    `${label}: no working tab. In a full Run, place Open URL first. For Event Test, focus a normal website tab.`,
  )
}

/**
 * Run the node's preWait strategy before the action body.
 * Interaction helpers (dismiss overlays / stabilize) are applied when requested.
 */
export async function runPreWait(args: {
  preWait?: PreWait | null
  activeTabId?: number
  dismissOverlays?: boolean
  stabilizeMs?: number
}): Promise<{ result: PreWaitResult; activeTabId?: number }> {
  const started = Date.now()
  let activeTabId = args.activeTabId
  const pre = args.preWait
  const strategy = pre?.strategy ?? 'none'

  if (args.dismissOverlays && activeTabId) {
    await runDom(activeTabId, {
      action: 'dismissOverlays',
      timeoutMs: 3_000,
    }).catch(() => undefined)
  }

  if (strategy === 'none' || !pre) {
    if (args.stabilizeMs && args.stabilizeMs > 0) {
      await sleep(args.stabilizeMs)
    }
    return {
      result: {
        strategy: 'none',
        elapsedMs: Date.now() - started,
        skipped: true,
      },
      activeTabId,
    }
  }

  const timeoutMs = pre.timeoutMs ?? 15_000

  switch (strategy) {
    case 'delay':
      await sleep(pre.delayMs ?? 500)
      break
    case 'random': {
      const min = pre.minMs ?? 200
      const max = Math.max(min, pre.maxMs ?? 800)
      await sleep(min + Math.floor(Math.random() * (max - min + 1)))
      break
    }
    case 'url': {
      activeTabId = await requireWorkingTab(activeTabId, 'preWait.url')
      const needle = pre.urlContains ?? ''
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const tab = await chrome.tabs.get(activeTabId).catch(() => null)
        if (tab?.url && (!needle || tab.url.includes(needle))) break
        await sleep(200)
      }
      break
    }
    case 'element': {
      activeTabId = await requireWorkingTab(activeTabId, 'preWait.element')
      const res = await runDom(activeTabId, {
        action: 'waitForElementVisible',
        selector: pre.selector || 'body',
        timeoutMs,
      })
      if (!res.ok) throw new Error(res.error ?? 'preWait.element failed')
      break
    }
    case 'text': {
      activeTabId = await requireWorkingTab(activeTabId, 'preWait.text')
      const res = await runDom(activeTabId, {
        action: 'waitForText',
        text: pre.text || '',
        timeoutMs,
        options: { matchMode: 'contains' },
      })
      if (!res.ok) throw new Error(res.error ?? 'preWait.text failed')
      break
    }
    case 'network_idle': {
      activeTabId = await requireWorkingTab(activeTabId, 'preWait.network_idle')
      const res = await runDom(activeTabId, {
        action: 'waitNetworkIdle',
        timeoutMs,
        options: { idleMs: pre.stableMs ?? 500 },
      })
      if (!res.ok) throw new Error(res.error ?? 'preWait.network_idle failed')
      break
    }
    case 'dom_stable': {
      activeTabId = await requireWorkingTab(activeTabId, 'preWait.dom_stable')
      const res = await runDom(activeTabId, {
        action: 'waitDomStable',
        timeoutMs,
        options: { stableMs: pre.stableMs ?? 400 },
      })
      if (!res.ok) throw new Error(res.error ?? 'preWait.dom_stable failed')
      break
    }
    default:
      break
  }

  if (args.stabilizeMs && args.stabilizeMs > 0) {
    await sleep(args.stabilizeMs)
  }

  return {
    result: {
      strategy,
      elapsedMs: Date.now() - started,
      skipped: false,
    },
    activeTabId,
  }
}
