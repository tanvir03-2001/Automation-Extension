import type { WorkflowStep } from '@/shared/types/workflow'
import type { AutomationCommand } from '@/shared/types/messages'
import { interpolateParams } from '@/shared/utils/interpolate'
import { sendTabMessage } from '@/shared/messaging/bus'
import { tabController } from '@/engine/automation/tab-controller'
import { chatGptModule } from '@/modules/chatgpt/chatgpt-module'
import { imageGenModule } from '@/modules/image-gen/image-gen-module'
import { ttsModule } from '@/modules/tts/tts-module'
import { downloadManager } from '@/modules/download/download-manager'
import { fileManager } from '@/modules/file-manager/file-manager'
import { sleep } from '@/engine/retry/retry-policy'

export interface StepContext {
  variables: Record<string, unknown>
  activeTabId?: number
}

export interface StepExecutionResult {
  output?: unknown
  activeTabId?: number
  variables?: Record<string, unknown>
}

async function runOnTab(
  tabId: number,
  command: AutomationCommand,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return sendTabMessage(tabId, {
    type: 'AUTOMATION_COMMAND',
    payload: command,
  })
}

export async function executeStep(
  step: WorkflowStep,
  context: StepContext,
): Promise<StepExecutionResult> {
  const params = interpolateParams(step.params, context.variables)
  let activeTabId = context.activeTabId

  switch (step.type) {
    case 'open_url': {
      const url = String(params.url ?? '')
      const tab = await tabController.openUrl(url, Boolean(params.active ?? true))
      activeTabId = tab.id
      return { activeTabId, output: { tabId: tab.id, url } }
    }
    case 'switch_tab': {
      const tabId = Number(params.tabId ?? activeTabId)
      if (!tabId) throw new Error('tabId is required for switch_tab')
      await tabController.switchToTab(tabId)
      return { activeTabId: tabId }
    }
    case 'wait_ms': {
      await sleep(Number(params.ms ?? 1000))
      return {}
    }
    case 'wait_for_element':
    case 'wait_for_text':
    case 'click':
    case 'type_text':
    case 'fill_form':
    case 'select_option':
    case 'press_key':
    case 'scroll':
    case 'extract_text':
    case 'extract_attribute':
    case 'assert_element': {
      if (!activeTabId) {
        const active = await tabController.getActiveTab()
        activeTabId = active?.id
      }
      if (!activeTabId) throw new Error('No active tab for DOM automation')

      const command = mapDomStep(step.type, params, step.timeoutMs)
      const result = await runOnTab(activeTabId, command)
      if (!result.ok) {
        const error = new Error(result.error ?? 'DOM automation failed')
        if (result.error?.includes('not found') || result.error?.includes('Element')) {
          error.name = 'ElementNotFoundError'
        }
        if (result.error?.includes('Timed out')) {
          error.name = 'TimeoutError'
        }
        throw error
      }
      return { activeTabId, output: result.data }
    }
    case 'download_file': {
      const url = String(params.url ?? '')
      const filename = params.filename ? String(params.filename) : undefined
      const downloadId = await downloadManager.download({ url, filename })
      return { output: { downloadId, url, filename } }
    }
    case 'organize_folder': {
      const path = fileManager.buildProjectPath(
        {
          projectName: String(params.projectName ?? 'default'),
          rootFolder: String(params.rootFolder ?? 'AutomationEngine'),
        },
        String(params.subfolder ?? ''),
      )
      return { output: { path } }
    }
    case 'chatgpt_prompt': {
      const prompt = String(params.prompt ?? '')
      const response = await chatGptModule.runPrompt(prompt)
      return { output: response, variables: { lastChatGptResponse: response } }
    }
    case 'image_generate': {
      const result = await imageGenModule.generate({
        prompt: String(params.prompt ?? ''),
        projectName: String(params.projectName ?? context.variables.projectName ?? 'default'),
        rootFolder: params.rootFolder ? String(params.rootFolder) : undefined,
      })
      return { output: result, variables: { lastImagePath: result.path } }
    }
    case 'tts_generate': {
      const result = await ttsModule.generate({
        text: String(params.text ?? ''),
      })
      if (params.autoDownload) {
        const filename = fileManager.buildProjectPath(
          {
            projectName: String(params.projectName ?? context.variables.projectName ?? 'default'),
            rootFolder: String(params.rootFolder ?? 'AutomationEngine'),
          },
          'audio',
          fileManager.buildAssetName('tts', 'mp3'),
        )
        const downloadId = await downloadManager.download({
          url: result.downloadHref,
          filename,
        })
        return {
          output: { ...result, downloadId, filename },
          variables: { lastTtsPath: filename },
        }
      }
      return { output: result }
    }
    case 'set_variable': {
      const key = String(params.key ?? '')
      const value = params.value
      if (!key) throw new Error('set_variable requires key')
      return { variables: { [key]: value } }
    }
    case 'custom_script': {
      // Intentionally unsupported for security — workflows must stay declarative.
      throw new Error('custom_script is disabled for security')
    }
    default: {
      const exhaustive: never = step.type
      throw new Error(`Unhandled step type: ${exhaustive}`)
    }
  }
}

function mapDomStep(
  type: WorkflowStep['type'],
  params: Record<string, unknown>,
  timeoutMs: number,
): AutomationCommand {
  switch (type) {
    case 'wait_for_element':
      return {
        action: 'waitForElement',
        selector: String(params.selector ?? ''),
        timeoutMs,
      }
    case 'wait_for_text':
      return {
        action: 'waitForText',
        text: String(params.text ?? ''),
        timeoutMs,
      }
    case 'click':
      return {
        action: 'click',
        selector: String(params.selector ?? ''),
        timeoutMs,
      }
    case 'type_text':
      return {
        action: 'type',
        selector: String(params.selector ?? ''),
        value: String(params.text ?? params.value ?? ''),
        timeoutMs,
      }
    case 'fill_form':
      return {
        action: 'fill',
        selector: String(params.selector ?? ''),
        value: String(params.value ?? ''),
        timeoutMs,
      }
    case 'select_option':
      return {
        action: 'select',
        selector: String(params.selector ?? ''),
        value: String(params.value ?? ''),
        timeoutMs,
      }
    case 'press_key':
      return {
        action: 'pressKey',
        selector: params.selector ? String(params.selector) : undefined,
        key: String(params.key ?? 'Enter'),
        timeoutMs,
      }
    case 'scroll':
      return {
        action: 'scroll',
        selector: params.selector ? String(params.selector) : undefined,
        options: { y: Number(params.y ?? 600) },
        timeoutMs,
      }
    case 'extract_text':
      return {
        action: 'extractText',
        selector: String(params.selector ?? ''),
        timeoutMs,
      }
    case 'extract_attribute':
      return {
        action: 'extractAttribute',
        selector: String(params.selector ?? ''),
        attribute: String(params.attribute ?? ''),
        timeoutMs,
      }
    case 'assert_element':
      return {
        action: 'assertElement',
        selector: String(params.selector ?? ''),
        timeoutMs,
      }
    default:
      throw new Error(`Not a DOM step: ${type}`)
  }
}
