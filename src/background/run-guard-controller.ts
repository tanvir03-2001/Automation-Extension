import { ensureContentScript } from '@/background/ensure-content-script'
import { sendTabMessage } from '@/shared/messaging/bus'

const KEEPALIVE_ALARM = 'ae-planner-keepalive'

class RunGuardController {
  private lockedTabId: number | null = null
  private enabled = false
  private navigationHooked = false

  isEnabled(): boolean {
    return this.enabled
  }

  getLockedTabId(): number | null {
    return this.lockedTabId
  }

  start(): void {
    this.enabled = true
    this.hookNavigation()
    void chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 })
  }

  async stop(): Promise<void> {
    this.enabled = false
    const tabId = this.lockedTabId
    this.lockedTabId = null
    await chrome.alarms.clear(KEEPALIVE_ALARM).catch(() => undefined)
    if (tabId != null) {
      await this.unlockTab(tabId)
    }
  }

  async lockTab(tabId: number, message?: string): Promise<void> {
    if (!this.enabled) this.start()

    if (this.lockedTabId != null && this.lockedTabId !== tabId) {
      await this.unlockTab(this.lockedTabId)
    }

    this.lockedTabId = tabId
    try {
      await ensureContentScript(tabId)
      await sendTabMessage(tabId, {
        type: 'RUN_GUARD_LOCK',
        payload: { message },
      })
    } catch {
      // Tab may be restricted or mid-navigation — retry on complete.
    }
  }

  async unlockTab(tabId: number): Promise<void> {
    try {
      await sendTabMessage(tabId, { type: 'RUN_GUARD_UNLOCK' })
    } catch {
      /* tab gone or no content script */
    }
    if (this.lockedTabId === tabId) this.lockedTabId = null
  }

  async refreshLockedTab(): Promise<void> {
    if (!this.enabled || this.lockedTabId == null) return
    await this.lockTab(this.lockedTabId)
  }

  private hookNavigation(): void {
    if (this.navigationHooked) return
    this.navigationHooked = true

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (!this.enabled || this.lockedTabId !== tabId) return
      if (changeInfo.status === 'complete' || changeInfo.url) {
        void this.lockTab(tabId)
      }
    })

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.lockedTabId === tabId) this.lockedTabId = null
    })
  }
}

export const runGuardController = new RunGuardController()
export { KEEPALIVE_ALARM }
