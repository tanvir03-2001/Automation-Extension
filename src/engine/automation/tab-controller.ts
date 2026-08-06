export type TabActivateOptions = {
  /** Make the tab selected inside its window (default true). */
  active?: boolean
  /** Bring the Chrome window to the front (default false — safer for automation). */
  focusWindow?: boolean
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
}

export const tabController = new TabController()
