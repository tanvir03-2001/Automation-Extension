import { attachTrustedDebugger } from '@/background/trusted-click'

export type TabActivateOptions = {
  /** Make the tab selected inside its window (default true). */
  active?: boolean
  /** Bring the Chrome window to the front (default false — safer for automation). */
  focusWindow?: boolean
}

type NavigationHistory = {
  currentIndex: number
  entries: Array<{ id: number; url?: string }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNoHistoryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /cannot find a (next|previous) page in history|no.*history|history entry/i.test(
    message,
  )
}

export class TabController {
  async openUrl(url: string, active = true): Promise<chrome.tabs.Tab> {
    const tab = await chrome.tabs.create({ url, active })
    await this.waitForComplete(tab.id!)
    return tab
  }

  /**
   * Open URL only if no matching tab exists; otherwise reuse it.
   * Does not force the Chrome window to the foreground unless focusWindow is true.
   */
  async openUrlOrFocus(
    url: string,
    activeOrOptions: boolean | TabActivateOptions = true,
  ): Promise<chrome.tabs.Tab> {
    const options: TabActivateOptions =
      typeof activeOrOptions === 'boolean'
        ? { active: activeOrOptions, focusWindow: false }
        : {
            active: activeOrOptions.active ?? true,
            focusWindow: activeOrOptions.focusWindow ?? false,
          }

    const needle = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return url.replace(/^https?:\/\//, '').split('/')[0] ?? url
      }
    })()

    const existing = (await this.findTabByUrl(needle)) ?? (await this.findTabByUrl(url))
    if (existing?.id) {
      await this.switchToTab(existing.id, options)
      await this.waitForComplete(existing.id).catch(() => undefined)
      return existing
    }
    return this.openUrl(url, options.active !== false)
  }

  async switchToTab(tabId: number, options: TabActivateOptions = {}): Promise<void> {
    const active = options.active !== false
    const focusWindow = options.focusWindow === true

    if (active) {
      await chrome.tabs.update(tabId, { active: true })
    }

    // Never require the OS window to be focused — automation keeps working minimized.
    if (focusWindow) {
      const tab = await chrome.tabs.get(tabId)
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true })
      }
    }
  }

  async findTabByUrl(urlPattern: string): Promise<chrome.tabs.Tab | undefined> {
    const tabs = await chrome.tabs.query({})
    const needle = urlPattern.trim().toLowerCase().replace(/\/$/, '')

    // Prefer exact / prefix matches, then hostname match
    const scored = tabs
      .filter((tab): tab is chrome.tabs.Tab & { url: string; id: number } =>
        typeof tab.url === 'string' && typeof tab.id === 'number',
      )
      .map((tab) => {
        const hay = tab.url.toLowerCase().replace(/\/$/, '')
        if (hay === needle || hay.startsWith(`${needle}/`) || hay.includes(needle)) {
          return { tab, score: hay === needle ? 3 : hay.startsWith(`${needle}/`) ? 2 : 1 }
        }
        try {
          const host = new URL(tab.url).hostname.replace(/^www\./, '')
          const needleHost = new URL(
            needle.includes('://') ? needle : `https://${needle}`,
          ).hostname.replace(/^www\./, '')
          if (host === needleHost || host.endsWith(`.${needleHost}`)) {
            return { tab, score: 1 }
          }
        } catch {
          /* ignore invalid urls */
        }
        return null
      })
      .filter((item): item is { tab: chrome.tabs.Tab & { url: string; id: number }; score: number } =>
        Boolean(item),
      )
      .sort((a, b) => b.score - a.score)

    return scored[0]?.tab
  }

  async getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    // Prefer a normal web tab over the extension dashboard window
    const [activeInWindow] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (
      activeInWindow?.id &&
      activeInWindow.url &&
      !activeInWindow.url.startsWith('chrome-extension://')
    ) {
      return activeInWindow
    }

    const tabs = await chrome.tabs.query({ active: true })
    return tabs.find((tab) => tab.url && !tab.url.startsWith('chrome-extension://')) ?? tabs[0]
  }

  async waitForComplete(tabId: number, timeoutMs = 60_000): Promise<void> {
    const started = Date.now()

    while (Date.now() - started < timeoutMs) {
      const tab = await chrome.tabs.get(tabId)
      if (tab.status === 'complete') return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    throw new Error(`Tab ${tabId} did not reach complete state`)
  }

  /**
   * Browser back — CDP history when possible, then tabs API, then page history.back().
   * Returns navigated:false when the tab has no previous entry (does not throw).
   */
  async goBack(tabId: number): Promise<{ navigated: boolean; message?: string }> {
    return this.navigateHistory(tabId, 'back')
  }

  /** Browser forward — same fallback chain as goBack. */
  async goForward(tabId: number): Promise<{ navigated: boolean; message?: string }> {
    return this.navigateHistory(tabId, 'forward')
  }

  private async navigateHistory(
    tabId: number,
    direction: 'back' | 'forward',
  ): Promise<{ navigated: boolean; message?: string }> {
    const before = await chrome.tabs.get(tabId)
    const urlBefore = before.url
    const indexBefore = await this.readHistoryIndex(tabId)

    const cdp = await this.tryCdpHistoryNavigate(tabId, direction)
    if (cdp === 'navigated') {
      await this.settleAfterHistoryNav(tabId, urlBefore)
      return { navigated: true }
    }
    if (cdp === 'no_entry') {
      return { navigated: false, message: this.noHistoryMessage(direction) }
    }

    try {
      if (direction === 'back') await chrome.tabs.goBack(tabId)
      else await chrome.tabs.goForward(tabId)
      await this.settleAfterHistoryNav(tabId, urlBefore)
      return { navigated: true }
    } catch (error) {
      if (!isNoHistoryError(error)) {
        const moved = await this.tryPageHistoryNavigate(
          tabId,
          direction,
          urlBefore,
          indexBefore,
        )
        if (moved) return { navigated: true }
        throw error instanceof Error ? error : new Error(String(error))
      }
    }

    const moved = await this.tryPageHistoryNavigate(
      tabId,
      direction,
      urlBefore,
      indexBefore,
    )
    if (moved) return { navigated: true }

    return { navigated: false, message: this.noHistoryMessage(direction) }
  }

  private noHistoryMessage(direction: 'back' | 'forward'): string {
    if (direction === 'back') {
      return 'No previous page in this tab\'s history — skipped Go Back (already at first page).'
    }
    return 'No forward page in this tab\'s history — skipped Go Forward.'
  }

  private async readHistoryIndex(tabId: number): Promise<number | undefined> {
    const attached = await attachTrustedDebugger(tabId)
    if (!attached) return undefined
    try {
      const history = (await chrome.debugger.sendCommand(
        { tabId },
        'Page.getNavigationHistory',
      )) as NavigationHistory
      return history.currentIndex
    } catch {
      return undefined
    }
  }

  private async tryCdpHistoryNavigate(
    tabId: number,
    direction: 'back' | 'forward',
  ): Promise<'navigated' | 'no_entry' | 'unavailable'> {
    const attached = await attachTrustedDebugger(tabId)
    if (!attached) return 'unavailable'

    try {
      const history = (await chrome.debugger.sendCommand(
        { tabId },
        'Page.getNavigationHistory',
      )) as NavigationHistory

      const targetIndex =
        direction === 'back' ? history.currentIndex - 1 : history.currentIndex + 1
      if (targetIndex < 0 || targetIndex >= history.entries.length) {
        return 'no_entry'
      }

      const entry = history.entries[targetIndex]
      if (!entry) return 'no_entry'

      await chrome.debugger.sendCommand({ tabId }, 'Page.navigateToHistoryEntry', {
        entryId: entry.id,
      })
      return 'navigated'
    } catch {
      return 'unavailable'
    }
  }

  private async tryPageHistoryNavigate(
    tabId: number,
    direction: 'back' | 'forward',
    urlBefore: string | undefined,
    indexBefore: number | undefined,
  ): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [direction],
        func: (dir: 'back' | 'forward') => {
          if (dir === 'back') window.history.back()
          else window.history.forward()
        },
      })
    } catch {
      return false
    }

    return this.waitForHistoryEvidence(tabId, urlBefore, indexBefore, 2_500)
  }

  /** Wait for load/URL change after a trusted CDP or tabs.goBack/goForward. */
  private async settleAfterHistoryNav(
    tabId: number,
    urlBefore: string | undefined,
    timeoutMs = 10_000,
  ): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const tab = await chrome.tabs.get(tabId)
      if (tab.url && urlBefore && tab.url !== urlBefore) {
        await this.waitForComplete(tabId).catch(() => undefined)
        return
      }
      if (tab.status === 'loading') {
        await this.waitForComplete(tabId).catch(() => undefined)
        return
      }
      await sleep(150)
    }
    // Same-URL SPA history entry — brief beat for the page to apply state
    await sleep(300)
  }

  /** @returns true only when URL, loading, or CDP history index actually changed. */
  private async waitForHistoryEvidence(
    tabId: number,
    urlBefore: string | undefined,
    indexBefore: number | undefined,
    timeoutMs: number,
  ): Promise<boolean> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const tab = await chrome.tabs.get(tabId)
      if (tab.url && urlBefore && tab.url !== urlBefore) {
        await this.waitForComplete(tabId).catch(() => undefined)
        return true
      }
      if (tab.status === 'loading') {
        await this.waitForComplete(tabId).catch(() => undefined)
        return true
      }
      if (indexBefore !== undefined) {
        const indexNow = await this.readHistoryIndex(tabId)
        if (indexNow !== undefined && indexNow !== indexBefore) {
          await sleep(200)
          return true
        }
      }
      await sleep(150)
    }
    return false
  }
}

export const tabController = new TabController()
