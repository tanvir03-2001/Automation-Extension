import type { AutomationCommand } from '@/shared/types/messages'
import { sendTabMessage } from '@/shared/messaging/bus'
import { tabController } from '@/engine/automation/tab-controller'
import { activityLog } from '@/engine/activity/activity-log'

/**
 * Site-specific automation rules for ChatGPT.
 * The extension does not generate content - it only drives the UI per workflow params.
 */
export interface ChatGptModuleConfig {
  url: string
  selectors: {
    promptInput: string
    sendButton: string
    responseContainer: string
    stopButton?: string
  }
  settleMs: number
}

export const DEFAULT_CHATGPT_CONFIG: ChatGptModuleConfig = {
  url: 'https://chatgpt.com',
  selectors: {
    promptInput: '#prompt-textarea, textarea[data-id], div[contenteditable="true"]',
    sendButton: 'button[data-testid="send-button"], button[aria-label*="Send"]',
    responseContainer: '[data-message-author-role="assistant"]',
    stopButton: 'button[aria-label*="Stop"]',
  },
  settleMs: 1500,
}

export class ChatGptModule {
  constructor(private readonly config: ChatGptModuleConfig = DEFAULT_CHATGPT_CONFIG) {}

  async runPrompt(prompt: string): Promise<string> {
    await activityLog.append('info', 'ChatGptModule', 'Opening ChatGPT and submitting prompt')

    let tab = await tabController.findTabByUrl(this.config.url)
    if (!tab?.id) {
      tab = await tabController.openUrl(this.config.url)
    } else {
      await tabController.switchToTab(tab.id)
      await tabController.waitForComplete(tab.id)
    }

    if (!tab.id) throw new Error('ChatGPT tab unavailable')

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.promptInput,
      timeoutMs: 45_000,
    })

    await this.exec(tab.id, {
      action: 'fill',
      selector: this.config.selectors.promptInput,
      value: prompt,
    })

    await this.exec(tab.id, {
      action: 'click',
      selector: this.config.selectors.sendButton,
    })

    await new Promise((resolve) => setTimeout(resolve, this.config.settleMs))

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.responseContainer,
      timeoutMs: 120_000,
    })

    // Wait until generation settles (stop button disappears when present)
    if (this.config.selectors.stopButton) {
      const started = Date.now()
      while (Date.now() - started < 180_000) {
        const probe = await this.exec(tab.id, {
          action: 'assertElement',
          selector: this.config.selectors.stopButton,
        })
        if (!probe.ok) break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    const result = await this.exec(tab.id, {
      action: 'extractText',
      selector: `${this.config.selectors.responseContainer}:last-of-type`,
    })

    if (!result.ok) throw new Error(result.error ?? 'Failed to extract ChatGPT response')
    return String(result.data ?? '')
  }

  private async exec(tabId: number, command: AutomationCommand) {
    return sendTabMessage<{ ok: boolean; data?: unknown; error?: string }>(tabId, {
      type: 'AUTOMATION_COMMAND',
      payload: command,
    })
  }
}

export const chatGptModule = new ChatGptModule()
