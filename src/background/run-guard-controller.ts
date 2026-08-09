import { ensureContentScript } from '@/background/ensure-content-script'
import {
  attachTrustedDebugger,
  detachAllTrustedClicks,
  detachTrustedClick,
  findDebuggableTabId,
  isTrustedClickSessionActive,
  setTrustedClickSession,
} from '@/background/trusted-click'
import { sendTabMessage } from '@/shared/messaging/bus'
import { activityLog } from '@/engine/activity/activity-log'

const KEEPALIVE_ALARM = 'ae-planner-keepalive'

/** Lightweight page Chrome will allow debugger.attach on (about:blank is flaky). */
const DEBUG_SEED_URL = 'https://example.com/'

class RunGuardController {
  private lockedTabId: number | null = null
  private enabled = false
  private navigationHooked = false

  isEnabled(): boolean {
    return this.enabled
  }

  isTrustedDebugActive(): boolean {
    return isTrustedClickSessionActive()
  }

  getLockedTabId(): number | null {
    return this.lockedTabId
  }

  /** Page lock / keepalive - debugger session starts on flow.start via beginTrustedDebug. */
  start(): void {
    this.enabled = true
    this.hookNavigation()
    void chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 })
  }

  /**
   * Turn ON Chrome debugger bar immediately (Start → End).
   * Attaches CDP independently of content-script injection.
   */
  async beginTrustedDebug(tabId?: number | null): Promise<number | undefined> {
    if (!this.enabled) this.start()
    setTrustedClickSession(true)

    let targetId = await findDebuggableTabId(tabId)

    // No normal web tab yet (dashboard focused) - open a seed page we can debug.
    if (targetId == null) {
      try {
        const seed = await chrome.tabs.create({ url: DEBUG_SEED_URL, active: false })
        targetId = seed.id
        if (targetId != null) {
          // Give the tab a moment so attach isn't racing an empty URL
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        void activityLog.append('warn', 'Debugger', `Could not open seed tab: ${message}`)
      }
    }

    if (targetId == null) {
      void activityLog.append(
        'warn',
        'Debugger',
        'Start ran but no tab available to attach debugger yet - will attach on Open URL',
      )
      return undefined
    }

    this.lockedTabId = targetId

    // 1) Attach debugger FIRST (this shows the Chrome infobar)
    let attached = await attachTrustedDebugger(targetId)
    if (!attached) {
      const fallback = await findDebuggableTabId(null)
      if (fallback != null && fallback !== targetId) {
        this.lockedTabId = fallback
        attached = await attachTrustedDebugger(fallback)
        if (attached) targetId = fallback
      }
    }

    if (attached) {
      void activityLog.append('info', 'Debugger', `Attached on tab ${targetId} (session on)`)
    } else {
      void activityLog.append(
        'warn',
        'Debugger',
        `Attach failed on Start - will retry when a website tab opens`,
      )
    }

    // 2) Page lock (optional - must not block debugger)
    try {
      await ensureContentScript(targetId)
      await sendTabMessage(targetId, {
        type: 'RUN_GUARD_LOCK',
        payload: { message: 'Automation started' },
      })
    } catch {
      /* restricted / blank / mid-nav */
    }

    return targetId
  }

  /** Turn OFF debugger bar at End / Stop. */
  async endTrustedDebug(): Promise<void> {
    setTrustedClickSession(false)
    await detachAllTrustedClicks()
    void activityLog.append('info', 'Debugger', 'Detached (End / Stop)')
  }

  async stop(): Promise<void> {
    this.enabled = false
    const tabId = this.lockedTabId
    this.lockedTabId = null
    await chrome.alarms.clear(KEEPALIVE_ALARM).catch(() => undefined)
    await this.endTrustedDebug()
    if (tabId != null) {
      await this.unlockTab(tabId)
      await detachTrustedClick(tabId)
    }
  }

  async lockTab(tabId: number, message?: string): Promise<void> {
    if (!this.enabled) this.start()

    if (this.lockedTabId != null && this.lockedTabId !== tabId) {
      await this.unlockTab(this.lockedTabId)
      // Keep debugger on previous tab during session; also attach to the new one.
      // Do not detach previous while session active - Chrome keeps the infobar
      // as long as any tab stays attached.
    }

    this.lockedTabId = tabId

    // Debugger attach is independent of content script (critical for Open URL).
    if (isTrustedClickSessionActive()) {
      const attached = await attachTrustedDebugger(tabId)
      if (attached) {
        void activityLog.append('info', 'Debugger', `Attached on tab ${tabId}`)
      } else {
        void activityLog.append('warn', 'Debugger', `Attach failed on tab ${tabId}`)
      }
    }

    try {
      await ensureContentScript(tabId)
      await sendTabMessage(tabId, {
        type: 'RUN_GUARD_LOCK',
        payload: { message },
      })
    } catch {
      // Tab may be restricted or mid-navigation - retry on complete.
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
      void detachTrustedClick(tabId)
    })
  }
}

export const runGuardController = new RunGuardController()
export { KEEPALIVE_ALARM }
