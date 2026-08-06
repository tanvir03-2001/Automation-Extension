import type { AutomationCommand } from '@/shared/types/messages'
import { sendTabMessage } from '@/shared/messaging/bus'
import { tabController } from '@/engine/automation/tab-controller'
import { activityLog } from '@/engine/activity/activity-log'

export interface TtsModuleConfig {
  url: string
  selectors: {
    textInput: string
    generateButton: string
    downloadButton: string
  }
}

export const DEFAULT_TTS_CONFIG: TtsModuleConfig = {
  url: 'https://ttsmp3.com',
  selectors: {
    textInput: '#voicetext, textarea',
    generateButton: '#downloaden, button[type="submit"]',
    downloadButton: 'a[download], #downloadlink, a[href*=".mp3"]',
  },
}

export interface TtsRequest {
  text: string
}

export class TtsModule {
  constructor(private readonly config: TtsModuleConfig = DEFAULT_TTS_CONFIG) {}

  async generate(request: TtsRequest): Promise<{ downloadHref: string }> {
    await activityLog.append('info', 'TtsModule', 'Starting TTS workflow')

    let tab = await tabController.findTabByUrl(this.config.url)
    if (!tab?.id) {
      tab = await tabController.openUrl(this.config.url)
    } else {
      await tabController.switchToTab(tab.id)
    }

    if (!tab.id) throw new Error('TTS tab unavailable')

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.textInput,
      timeoutMs: 45_000,
    })

    await this.exec(tab.id, {
      action: 'fill',
      selector: this.config.selectors.textInput,
      value: request.text,
    })

    await this.exec(tab.id, {
      action: 'click',
      selector: this.config.selectors.generateButton,
    })

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.downloadButton,
      timeoutMs: 120_000,
    })

    const href = await this.exec(tab.id, {
      action: 'extractAttribute',
      selector: this.config.selectors.downloadButton,
      attribute: 'href',
    })

    if (!href.ok || !href.data) {
      throw new Error(href.error ?? 'TTS download link not found')
    }

    return { downloadHref: String(href.data) }
  }

  private async exec(tabId: number, command: AutomationCommand) {
    return sendTabMessage<{ ok: boolean; data?: unknown; error?: string }>(tabId, {
      type: 'AUTOMATION_COMMAND',
      payload: command,
    })
  }
}

export const ttsModule = new TtsModule()
