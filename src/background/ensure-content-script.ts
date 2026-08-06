import { sendTabMessage } from '@/shared/messaging/bus'

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix))
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await sendTabMessage<{ ok?: boolean }>(tabId, { type: 'CONTENT_PING' })
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

/** Inject manifest content scripts when the tab has none (common after extension reload). */
export async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return

  const tab = await chrome.tabs.get(tabId)
  if (isRestrictedUrl(tab.url)) {
    throw new Error(
      'Cannot run on this page. Open a normal website (e.g. ChatGPT) and try again.',
    )
  }

  const manifest = chrome.runtime.getManifest()
  const files = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? [])
  if (files.length === 0) {
    throw new Error('Content script missing from extension manifest')
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  })

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await pingContentScript(tabId)) return
    await delay(250)
  }

  throw new Error('Content script failed to load. Refresh the target tab and try again.')
}
