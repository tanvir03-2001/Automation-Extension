import contentScriptFile from '@/content/index.ts?script'
import { sendTabMessage } from '@/shared/messaging/bus'

/** Stable path written by the Vite post-build plugin (survives rebuild without extension reload). */
const STABLE_CONTENT_LOADER = 'assets/content-loader.js'

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

const RELOAD_HINT =
  'Extension scripts are out of date. Open chrome://extensions → Reload "Automation Engine", then refresh the target tab.'

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

async function extensionFileExists(file: string): Promise<boolean> {
  try {
    const response = await fetch(chrome.runtime.getURL(file))
    return response.ok
  } catch {
    return false
  }
}

function uniqueFiles(files: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const file of files) {
    if (!file || seen.has(file)) continue
    seen.add(file)
    out.push(file)
  }
  return out
}

function contentScriptCandidates(): string[] {
  const manifest = chrome.runtime.getManifest()
  const fromManifest = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? [])
  return uniqueFiles([STABLE_CONTENT_LOADER, contentScriptFile, ...fromManifest])
}

async function waitUntilReady(tabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await pingContentScript(tabId)) return true
    await delay(250)
  }
  return false
}

function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /could not load file/i.test(message)
}

/** Inject manifest content scripts when the tab has none (common after extension reload). */
export async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return

  const tab = await chrome.tabs.get(tabId)
  if (isRestrictedUrl(tab.url)) {
    throw new Error(
      'Cannot run on this page. Focus a normal http/https website tab and try again.',
    )
  }

  const candidates = contentScriptCandidates()
  const available: string[] = []
  for (const file of candidates) {
    if (await extensionFileExists(file)) available.push(file)
  }

  if (available.length === 0) {
    throw new Error(RELOAD_HINT)
  }

  let lastError: unknown
  for (const file of available) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [file],
      })
      if (await waitUntilReady(tabId)) return
    } catch (error) {
      lastError = error
      if (!isMissingFileError(error)) {
        // Permission / CSP / tab closed - surface immediately
        throw error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  if (lastError && isMissingFileError(lastError)) {
    throw new Error(RELOAD_HINT)
  }

  throw new Error('Content script failed to load. Refresh the target tab and try again.')
}
