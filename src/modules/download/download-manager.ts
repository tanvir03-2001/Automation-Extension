export interface DownloadOptions {
  url: string
  filename?: string
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
  saveAs?: boolean
}

export class DownloadManager {
  async download(options: DownloadOptions): Promise<number> {
    const downloadId = await chrome.downloads.download({
      url: options.url,
      filename: options.filename,
      conflictAction: options.conflictAction ?? 'uniquify',
      saveAs: options.saveAs ?? false,
    })

    await this.waitForComplete(downloadId)
    return downloadId
  }

  async waitForComplete(downloadId: number, timeoutMs = 120_000): Promise<void> {
    const started = Date.now()

    while (Date.now() - started < timeoutMs) {
      const [item] = await chrome.downloads.search({ id: downloadId })
      if (!item) throw new Error(`Download ${downloadId} not found`)
      if (item.state === 'complete') return
      if (item.state === 'interrupted') {
        throw new Error(`Download interrupted: ${item.error ?? 'unknown'}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    throw new Error(`Download ${downloadId} timed out`)
  }
}

export const downloadManager = new DownloadManager()
