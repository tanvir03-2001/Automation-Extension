const DASHBOARD_WIDTH = 1180
const DASHBOARD_HEIGHT = 760

let dashboardWindowId: number | undefined

export async function openFloatingDashboard(): Promise<void> {
  if (dashboardWindowId !== undefined) {
    try {
      await chrome.windows.update(dashboardWindowId, { focused: true })
      return
    } catch {
      dashboardWindowId = undefined
    }
  }

  const url = chrome.runtime.getURL('src/dashboard/index.html')
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: DASHBOARD_WIDTH,
    height: DASHBOARD_HEIGHT,
    focused: true,
  })

  dashboardWindowId = win.id

  chrome.windows.onRemoved.addListener(function onRemoved(windowId) {
    if (windowId === dashboardWindowId) {
      dashboardWindowId = undefined
      chrome.windows.onRemoved.removeListener(onRemoved)
    }
  })
}
