import type { AutomationCommand } from '@/shared/types/messages'
import { sendTabMessage } from '@/shared/messaging/bus'
import { tabController } from '@/engine/automation/tab-controller'
import { downloadManager } from '@/modules/download/download-manager'
import { fileManager } from '@/modules/file-manager/file-manager'
import { activityLog } from '@/engine/activity/activity-log'

export interface ImageGenModuleConfig {
  url: string
  selectors: {
    promptInput: string
    generateButton: string
    resultImage: string
  }
}

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenModuleConfig = {
  url: 'https://www.bing.com/images/create',
  selectors: {
    promptInput: '#sb_form_q, textarea[name="q"], input[name="q"]',
    generateButton: '#create_btn_c, button[type="submit"]',
    resultImage: '.img_cont img, img.mimg, img[src*="th?id="]',
  },
}

export interface ImageGenRequest {
  prompt: string
  projectName: string
  rootFolder?: string
}

export class ImageGenModule {
  constructor(private readonly config: ImageGenModuleConfig = DEFAULT_IMAGE_GEN_CONFIG) {}

  async generate(request: ImageGenRequest): Promise<{ downloadId: number; path: string }> {
    await activityLog.append('info', 'ImageGenModule', 'Starting image generation workflow', {
      promptLength: request.prompt.length,
    })

    let tab = await tabController.findTabByUrl(this.config.url)
    if (!tab?.id) {
      tab = await tabController.openUrl(this.config.url)
    } else {
      await tabController.switchToTab(tab.id)
    }

    if (!tab.id) throw new Error('Image generation tab unavailable')

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.promptInput,
      timeoutMs: 45_000,
    })

    await this.exec(tab.id, {
      action: 'fill',
      selector: this.config.selectors.promptInput,
      value: request.prompt,
    })

    await this.exec(tab.id, {
      action: 'click',
      selector: this.config.selectors.generateButton,
    })

    await this.exec(tab.id, {
      action: 'waitForElement',
      selector: this.config.selectors.resultImage,
      timeoutMs: 180_000,
    })

    const srcResult = await this.exec(tab.id, {
      action: 'extractAttribute',
      selector: this.config.selectors.resultImage,
      attribute: 'src',
    })

    if (!srcResult.ok || !srcResult.data) {
      throw new Error(srcResult.error ?? 'Image source not found')
    }

    const filename = fileManager.buildProjectPath(
      {
        projectName: request.projectName,
        rootFolder: request.rootFolder ?? 'AutomationEngine',
      },
      'images',
      fileManager.buildAssetName('image', 'png'),
    )

    const downloadId = await downloadManager.download({
      url: String(srcResult.data),
      filename,
    })

    return { downloadId, path: filename }
  }

  private async exec(tabId: number, command: AutomationCommand) {
    return sendTabMessage<{ ok: boolean; data?: unknown; error?: string }>(tabId, {
      type: 'AUTOMATION_COMMAND',
      payload: command,
    })
  }
}

export const imageGenModule = new ImageGenModule()
