import { interpolate, interpolateParams } from '@/shared/utils/interpolate'
import { sendTabMessage } from '@/shared/messaging/bus'
import { ensureContentScript } from '@/background/ensure-content-script'
import { runGuardController } from '@/background/run-guard-controller'
import { tabController } from '@/engine/automation/tab-controller'
import { downloadManager } from '@/modules/download/download-manager'
import { chatGptModule } from '@/modules/chatgpt/chatgpt-module'
import { activityLog } from '@/engine/activity/activity-log'
import { sleep } from '@/engine/retry/retry-policy'
import { resolveTypeText, typingDelayRange } from '@/planner/engine/text-library'
import { collectJsonParts } from '@/planner/engine/multipart-collect'
import { copyStore } from '@/engine/copy-store'
import type { ActionHandlerResult } from '@/planner/actions/types'
import type { AutomationCommand } from '@/shared/types/messages'

async function sendDom(
  tabId: number,
  command: AutomationCommand,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  await ensureContentScript(tabId)
  // Avoid re-locking on every step (races with click bypass). Lock only if needed.
  if (
    runGuardController.isEnabled() &&
    runGuardController.getLockedTabId() !== tabId
  ) {
    await runGuardController.lockTab(tabId)
  }
  return sendTabMessage(tabId, { type: 'AUTOMATION_COMMAND', payload: command })
}

async function ensureTab(activeTabId?: number): Promise<number> {
  if (activeTabId) return activeTabId
  const active = await tabController.getActiveTab()
  if (!active?.id) throw new Error('No active tab')
  return active.id
}

function evaluateCondition(
  left: unknown,
  operator: string,
  right: unknown,
): boolean {
  const l = left == null ? '' : String(left)
  const r = right == null ? '' : String(right)
  switch (operator) {
    case 'equals':
      return l === r
    case 'not_equals':
      return l !== r
    case 'contains':
      return l.includes(r)
    case 'starts_with':
      return l.startsWith(r)
    case 'ends_with':
      return l.endsWith(r)
    case 'gt':
      return Number(l) > Number(r)
    case 'lt':
      return Number(l) < Number(r)
    case 'empty':
      return l.trim().length === 0
    case 'not_empty':
      return l.trim().length > 0
    case 'regex':
      return new RegExp(r).test(l)
    default:
      return false
  }
}

async function persistCopyResult(args: {
  text: string
  variables: Record<string, unknown>
  workflowId?: string
  nameTemplate: string
  format: 'text' | 'json'
  shouldStore: boolean
  shouldCopy: boolean
  activeTabId?: number
  runDom: (
    tabId: number,
    command: AutomationCommand,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>
}): Promise<{
  activeTabId?: number
  clipboardPayload: string
  storePatch: Record<string, unknown>
  entryName?: string
  clipboardOk: boolean
  clipboardError?: string
}> {
  let clipboardPayload = args.text
  let storePatch: Record<string, unknown> = {}
  let entryName: string | undefined

  if (args.shouldStore && args.workflowId) {
    const created = await copyStore.create(args.variables, {
      workflowId: args.workflowId,
      name: args.nameTemplate || 'copy-{_NumberAuto}',
      text: args.text,
      format: args.format,
    })
    clipboardPayload = created.clipboardPayload
    entryName = created.entry.name
    storePatch = copyStore.toVariablesPatch(created)
    await activityLog.append(
      'info',
      'CopyStore',
      `Saved ${created.entry.name} (prefix=${created.entry.prefix}, #${created.entry.number})`,
    )
  } else if (args.format === 'json') {
    clipboardPayload = copyStore.formatClipboardPayload(
      args.nameTemplate || 'copy',
      args.text,
      'json',
    )
  }

  let clipboardOk = true
  let clipboardError: string | undefined
  let activeTabId = args.activeTabId

  if (args.shouldCopy) {
    try {
      let tabId = activeTabId
      if (!tabId) {
        const active = await tabController.getActiveTab()
        tabId = active?.id
      }
      if (!tabId) {
        clipboardOk = false
        clipboardError = 'No active tab for Clipboard API (variable mirror kept)'
      } else {
        activeTabId = tabId
        const result = await args.runDom(tabId, {
          action: 'writeClipboard',
          value: clipboardPayload,
          text: clipboardPayload,
        })
        if (!result.ok) {
          clipboardOk = false
          clipboardError = result.error ?? 'Clipboard write failed'
        }
      }
    } catch (error) {
      clipboardOk = false
      clipboardError = error instanceof Error ? error.message : String(error)
    }
  }

  if (!clipboardOk) {
    await activityLog.append(
      'warn',
      'Clipboard',
      `OS clipboard write failed (variable mirror kept): ${clipboardError}`,
    )
  }

  return {
    activeTabId,
    clipboardPayload,
    storePatch,
    entryName,
    clipboardOk,
    clipboardError,
  }
}

export async function executePlannerAction(args: {
  actionId: string
  params: Record<string, unknown>
  variables: Record<string, unknown>
  activeTabId?: number
  timeoutMs: number
  workflowId?: string
  nodeId?: string
  planId?: string
}): Promise<ActionHandlerResult> {
  const params = interpolateParams(args.params, args.variables)
  const selector = params.selector ? String(params.selector) : undefined
  const fallbacks = Array.isArray(params.selectorFallbacks)
    ? (params.selectorFallbacks as unknown[]).map(String).filter(Boolean)
    : typeof params.selectorFallbacks === 'string'
      ? String(params.selectorFallbacks)
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  let activeTabId = args.activeTabId

  const runDom = (tabId: number, command: AutomationCommand) =>
    sendDom(tabId, { ...command, fallbacks: command.fallbacks ?? fallbacks })

  try {
    switch (args.actionId) {
      case 'flow.start': {
        // Debugger bar ON from Start → stays until End
        const tabId = await runGuardController.beginTrustedDebug(args.activeTabId)
        return { status: 'success', activeTabId: tabId ?? args.activeTabId }
      }

      case 'flow.end': {
        // Debugger bar OFF at End
        await runGuardController.endTrustedDebug()
        return { status: 'success' }
      }

      case 'flow.connector':
        // Visual / wiring marker only — no side effects
        return { status: 'success' }

      case 'flow.return':
        return { status: 'success' }

      case 'flow.stop': {
        await runGuardController.endTrustedDebug()
        return { status: 'success', nextNodeId: null }
      }

      case 'flow.pause':
        return { status: 'waiting' }

      case 'flow.goto_step':
        return { status: 'success', nextNodeId: String(params.targetNodeId ?? '') }

      case 'flow.goto_workflow':
        return {
          status: 'success',
          output: { nestedWorkflowId: String(params.workflowId ?? '') },
          branch: 'nested',
        }

      case 'flow.next_plan_execute': {
        const targetId = String(params.workflowId ?? '').trim()
        if (!targetId) {
          throw new Error('Next Plan Execute needs a target plan. Pick one from the dropdown.')
        }
        if (args.workflowId && targetId === args.workflowId) {
          throw new Error('Next Plan Execute cannot target the current plan.')
        }
        return {
          status: 'success',
          output: { nextWorkflowId: targetId, planId: args.planId },
          branch: 'execute_plan',
        }
      }

      case 'browser.open_url':
      case 'browser.new_tab':
      case 'ai.open_chatgpt':
      case 'ai.open_claude':
      case 'ai.open_gemini':
      case 'ai.open_grok': {
        const url = String(params.url ?? 'https://chatgpt.com/')
        const reuse = params.reuseExisting !== false
        // Never force the OS window forward — flow keeps working if Chrome is minimized.
        const tab = reuse
          ? await tabController.openUrlOrFocus(url, {
              active: Boolean(params.active ?? true),
              focusWindow: Boolean(params.focusWindow ?? false),
            })
          : await tabController.openUrl(url, Boolean(params.active ?? true))
        if (tab.id != null && runGuardController.isEnabled()) {
          // Ensure debugger session sticks across Open URL (reattach if SW lost state)
          if (!runGuardController.isTrustedDebugActive()) {
            await runGuardController.beginTrustedDebug(tab.id)
          } else {
            await runGuardController.lockTab(tab.id)
          }
        }
        return { status: 'success', activeTabId: tab.id, output: { tabId: tab.id, url } }
      }

      case 'browser.refresh':
      case 'browser.reload': {
        activeTabId = await ensureTab(activeTabId)
        await chrome.tabs.reload(activeTabId)
        await tabController.waitForComplete(activeTabId)
        return { status: 'success', activeTabId }
      }

      case 'browser.go_back': {
        activeTabId = await ensureTab(activeTabId)
        const back = await tabController.goBack(activeTabId)
        const failIfNoHistory = Boolean(params.failIfNoHistory ?? false)
        if (!back.navigated) {
          if (failIfNoHistory) {
            throw new Error(
              back.message ??
                "No previous page in this tab's history. Use Open URL if you need a fixed destination.",
            )
          }
          await activityLog.append(
            'warn',
            'Planner',
            back.message ?? 'Go Back skipped — no previous page in history',
          )
          return {
            status: 'success',
            activeTabId,
            output: { navigated: false, skipped: true },
          }
        }
        return { status: 'success', activeTabId, output: { navigated: true } }
      }

      case 'browser.go_forward': {
        activeTabId = await ensureTab(activeTabId)
        const forward = await tabController.goForward(activeTabId)
        const failIfNoHistory = Boolean(params.failIfNoHistory ?? false)
        if (!forward.navigated) {
          if (failIfNoHistory) {
            throw new Error(
              forward.message ?? "No forward page in this tab's history.",
            )
          }
          await activityLog.append(
            'warn',
            'Planner',
            forward.message ?? 'Go Forward skipped — no forward page in history',
          )
          return {
            status: 'success',
            activeTabId,
            output: { navigated: false, skipped: true },
          }
        }
        return { status: 'success', activeTabId, output: { navigated: true } }
      }

      case 'browser.close_tab': {
        activeTabId = await ensureTab(activeTabId)
        await chrome.tabs.remove(activeTabId)
        return { status: 'success', activeTabId: undefined }
      }

      case 'browser.switch_tab':
      case 'browser.focus_tab': {
        // Default stays quiet so Chrome can stay minimized; set focusWindow:true only if needed
        const focusWindow = Boolean(params.focusWindow ?? false)
        if (params.urlIncludes) {
          const found = await tabController.findTabByUrl(String(params.urlIncludes))
          if (!found?.id) throw new Error('Tab not found')
          await tabController.switchToTab(found.id, { focusWindow })
          if (runGuardController.isEnabled()) await runGuardController.lockTab(found.id)
          return { status: 'success', activeTabId: found.id }
        }
        const tabId = Number(params.tabId ?? activeTabId)
        await tabController.switchToTab(tabId, { focusWindow })
        if (runGuardController.isEnabled()) await runGuardController.lockTab(tabId)
        return { status: 'success', activeTabId: tabId }
      }

      case 'browser.wait_for_page': {
        activeTabId = await ensureTab(activeTabId)
        await tabController.waitForComplete(activeTabId, args.timeoutMs)
        return { status: 'success', activeTabId }
      }

      case 'browser.scroll': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'scroll',
          options: { y: Number(params.y ?? 600) },
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'browser.scroll_to': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'scroll',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'browser.download_file':
      case 'downloads.download_url': {
        const downloadId = await downloadManager.download({
          url: String(params.url ?? ''),
          filename: params.filename ? String(params.filename) : undefined,
        })
        return { status: 'success', output: { downloadId } }
      }

      case 'mouse.click': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'click',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        return { status: 'success', activeTabId }
      }

      case 'downloads.click_download': {
        activeTabId = await ensureTab(activeTabId)
        if (!selector) {
          throw new Error('Download Click needs a picked Download button — use Pick with mouse')
        }
        const result = await runDom(activeTabId, {
          action: 'clickOnce',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId }
      }

      case 'mouse.click_exact': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? params.buttonText ?? params.buttonName ?? '').trim()
        if (!text && !selector) {
          throw new Error('Provide exact text/label, or Pick with mouse on the target')
        }
        const result = await runDom(activeTabId, {
          action: 'clickExact',
          text,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { exact: true },
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'mouse.click_text': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? params.buttonText ?? params.buttonName ?? '').trim()
        if (!text && !selector) {
          throw new Error('Provide text to find, or Pick with mouse on the target')
        }
        const result = await runDom(activeTabId, {
          action: 'clickByText',
          text,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'contains') },
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'mouse.click_aria': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? params.ariaLabel ?? '').trim()
        if (!text && !selector) {
          throw new Error('Provide aria-label, or Pick with mouse on the target')
        }
        const result = await runDom(activeTabId, {
          action: 'clickByAria',
          text,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'exact') },
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'mouse.click_button': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? params.buttonText ?? params.buttonName ?? '').trim()
        if (!text && !selector) {
          throw new Error('Provide button name, or Pick with mouse on the target')
        }
        const result = await runDom(activeTabId, {
          action: 'clickByButton',
          text,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'contains') },
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'mouse.click_link': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? params.href ?? '').trim()
        if (!text && !selector) {
          throw new Error('Provide link text or href, or Pick with mouse on the target')
        }
        const result = await runDom(activeTabId, {
          action: 'clickByLink',
          text,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'contains') },
        })
        if (!result.ok) {
          throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        }
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'mouse.click_coordinates': {
        activeTabId = await ensureTab(activeTabId)
        const x = Number(params.x)
        const y = Number(params.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('Click Coordinates needs valid X and Y numbers')
        }
        const result = await runDom(activeTabId, {
          action: 'clickAt',
          timeoutMs: args.timeoutMs,
          options: { x, y },
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'ai.click_send': {
        activeTabId = await ensureTab(activeTabId)
        // Wait briefly so ChatGPT enables Send after Paste/Type
        await sleep(400)
        const sendSelector =
          selector ||
          'button[data-testid="send-button"], button[data-testid="composer-send-button"], button[aria-label*="Send"]'
        const result = await runDom(activeTabId, {
          action: 'clickSend',
          selector: sendSelector,
          timeoutMs: Math.max(args.timeoutMs, 20_000),
        })
        if (!result.ok) throw Object.assign(new Error(result.error), { name: 'ElementNotFoundError' })
        return { status: 'success', activeTabId }
      }

      case 'mouse.double_click':
      case 'mouse.right_click':
      case 'mouse.hover': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'click',
          selector,
          timeoutMs: args.timeoutMs,
          options: { mode: args.actionId.replace('mouse.', '') },
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'keyboard.type_text':
      case 'keyboard.paste_text': {
        activeTabId = await ensureTab(activeTabId)
        const pasteMode = args.actionId === 'keyboard.paste_text'

        const resolved = await resolveTypeText({
          params,
          workflowId: args.workflowId,
          nodeId: args.nodeId,
          planId: args.planId,
        })
        if (!resolved.text.trim()) {
          throw new Error(
            pasteMode
              ? 'Nothing to paste. Pick a Text library title, or enter manual text on Paste Text.'
              : 'Nothing to type. Pick a Text library title, or enter manual text on TypeText.',
          )
        }

        const delays = pasteMode
          ? null
          : typingDelayRange(String(params.typingSpeed ?? 'human'))

        await activityLog.append(
          'info',
          'Planner',
          `${pasteMode ? 'PasteText' : 'TypeText'}${resolved.meta ? ` (${resolved.meta})` : ''}: ${resolved.text.slice(0, 80)}`,
        )

        // Brief pause so ChatGPT composer is ready after "New chat" click
        await sleep(pasteMode ? 700 : 400)

        const result = await runDom(activeTabId, {
          action: pasteMode ? 'paste' : delays ? 'type' : 'fill',
          selector: selector || undefined,
          value: resolved.text,
          timeoutMs: Math.max(args.timeoutMs, pasteMode ? 60_000 : args.timeoutMs),
          options: delays
            ? { humanTyping: true, delayMin: delays.min, delayMax: delays.max }
            : { humanTyping: false },
        })
        if (!result.ok) throw new Error(result.error)
        // Let ChatGPT enable the Send button before the next step
        if (pasteMode) await sleep(500)
        return {
          status: 'success',
          activeTabId,
          output: {
            text: resolved.text,
            meta: resolved.meta,
            hasMore: Boolean(resolved.hasMore),
            index: resolved.index,
            total: resolved.total,
            mode: pasteMode ? 'paste' : 'type',
          },
          variables: {
            __lastTypedText: resolved.text,
            __lastTypedMeta: resolved.meta ?? '',
            __libraryHasMore: Boolean(resolved.hasMore),
            __libraryQueueIndex: resolved.index ?? 0,
            __libraryQueueTotal: resolved.total ?? 1,
          },
        }
      }

      case 'input.fill':
      case 'ai.paste_prompt': {
        activeTabId = await ensureTab(activeTabId)
        const value = String(params.text ?? params.value ?? params.prompt ?? '')
        const result = await runDom(activeTabId, {
          action: 'fill',
          selector,
          value,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'input.clear': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'fill',
          selector,
          value: '',
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'input.append': {
        activeTabId = await ensureTab(activeTabId)
        const current = await runDom(activeTabId, {
          action: 'extractAttribute',
          selector,
          attribute: 'value',
          timeoutMs: args.timeoutMs,
        })
        const next = `${String(current.data ?? '')}${String(params.value ?? '')}`
        const result = await runDom(activeTabId, {
          action: 'fill',
          selector,
          value: next,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'input.dropdown': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'select',
          selector,
          value: String(params.value ?? ''),
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'keyboard.press_key':
      case 'keyboard.shortcut': {
        activeTabId = await ensureTab(activeTabId)
        const chordRaw =
          params.keys ??
          params.key ??
          params.shortcut ??
          (args.actionId === 'keyboard.shortcut' ? 'Control+Enter' : 'Enter')
        const keys = Array.isArray(chordRaw)
          ? chordRaw.map((k) => String(k))
          : String(chordRaw)
              .split('+')
              .map((part) => part.trim())
              .filter(Boolean)
        const result = await runDom(activeTabId, {
          action: 'pressKey',
          selector: selector || undefined,
          key: keys.join('+'),
          timeoutMs: args.timeoutMs,
          options: { keys },
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId, output: result.data }
      }

      case 'element.wait_visible':
      case 'element.wait_icon':
      case 'wait.until_element': {
        activeTabId = await ensureTab(activeTabId)
        if (!selector) throw new Error('Selector is required — pick the element/icon with mouse')
        const result = await runDom(activeTabId, {
          action: 'waitForElementVisible',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.if_visible': {
        activeTabId = await ensureTab(activeTabId)
        if (!selector) throw new Error('Selector is required — pick the button/element with mouse')
        const pollMs = Math.max(
          0,
          Number(params.pollMs ?? args.timeoutMs ?? 2500),
        )
        const result = await runDom(activeTabId, {
          action: 'checkElementVisible',
          selector,
          timeoutMs: pollMs,
        })
        if (!result.ok) throw new Error(result.error)
        const visible = Boolean(
          (result.data as { visible?: boolean } | undefined)?.visible,
        )
        return {
          status: 'success',
          branch: visible ? 'true' : 'false',
          activeTabId,
          output: { visible },
          variables: { __lastVisible: visible },
        }
      }

      case 'element.wait_hidden':
      case 'wait.until_hidden': {
        activeTabId = await ensureTab(activeTabId)
        if (!selector) throw new Error('Selector is required — pick the element with mouse')
        const result = await runDom(activeTabId, {
          action: 'waitForElementHidden',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.wait_clickable':
      case 'wait.until_clickable': {
        activeTabId = await ensureTab(activeTabId)
        if (!selector) throw new Error('Selector is required — pick the element with mouse')
        const result = await runDom(activeTabId, {
          action: 'waitForClickable',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.wait_text':
      case 'wait.until_text': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? '')
        if (!text.trim()) throw new Error('Text is required')
        const result = await runDom(activeTabId, {
          action: 'waitForText',
          text,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'contains') },
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.wait_exact_text': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? '')
        if (!text.trim()) throw new Error('Exact text is required')
        const result = await runDom(activeTabId, {
          action: 'waitForExactText',
          text,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.wait_text_gone': {
        activeTabId = await ensureTab(activeTabId)
        const text = String(params.text ?? '')
        if (!text.trim()) throw new Error('Text is required')
        const result = await runDom(activeTabId, {
          action: 'waitForTextGone',
          text,
          timeoutMs: args.timeoutMs,
          options: { matchMode: String(params.matchMode ?? 'contains') },
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'element.wait_button':
      case 'wait.until_button': {
        activeTabId = await ensureTab(activeTabId)
        const buttonText = String(params.buttonText ?? params.text ?? '')
        if (!selector && !buttonText.trim()) {
          throw new Error('Provide a button label or pick a selector with mouse')
        }
        const result = await runDom(activeTabId, {
          action: 'waitForButton',
          text: buttonText,
          selector: selector || undefined,
          timeoutMs: args.timeoutMs,
          options: { exact: Boolean(params.exact) },
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'ai.wait_response': {
        activeTabId = await ensureTab(activeTabId)
        // Prefer waiting until streaming/generation fully ends
        const result = await runDom(activeTabId, {
          action: 'waitForGenerationEnd',
          timeoutMs: args.timeoutMs || 180_000,
        })
        if (!result.ok) {
          const err = new Error(result.error)
          err.name = 'TimeoutError'
          throw err
        }
        return { status: 'success', activeTabId }
      }

      case 'ai.collect_json_parts': {
        activeTabId = await ensureTab(activeTabId)
        const outputKey = String(params.outputKey ?? 'finalStoryJson')
        const filename = interpolate(String(params.filename ?? 'chatgpt-story.json'), args.variables)
        // Always read the latest assistant message from the page (after Wait Response)
        const collected = await collectJsonParts({
          activeTabId,
          timeoutMs: args.timeoutMs || 300_000,
          maxParts: Number(params.maxParts ?? 12),
          filename,
          autoDownload: params.autoDownload !== false,
        })
        return {
          status: 'success',
          activeTabId,
          output: collected,
          variables: {
            [outputKey]: collected.finalJson,
            storyPartCount: collected.partCount,
            storyCollectMode: collected.mode,
            storyJsonValid: collected.validJson,
            storyDownloadId: collected.downloadId ?? null,
            storyFilename: collected.filename,
            aiResponse: collected.finalJson,
          },
        }
      }

      case 'flow.repeat_if_more': {
        const target = String(params.targetNodeId ?? '')
        if (!target) throw new Error('flow.repeat_if_more needs targetNodeId (e.g. New chat node id)')
        const hasMore = Boolean(args.variables.__libraryHasMore)
        await activityLog.append(
          'info',
          'Planner',
          hasMore
            ? `More titles remain (${String(args.variables.__libraryQueueIndex ?? '?')}/${String(args.variables.__libraryQueueTotal ?? '?')}) — jump to ${target}`
            : 'Library queue finished — continue to End',
        )
        if (hasMore) {
          return { status: 'success', nextNodeId: target }
        }
        return { status: 'success' }
      }

      case 'element.find': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'assertElement',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        return { status: 'success', activeTabId }
      }

      case 'element.extract_text':
      case 'ai.copy_response': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'extractText',
          selector,
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        const key = String(params.outputKey ?? 'extractedText')
        return {
          status: 'success',
          activeTabId,
          output: result.data,
          variables: { [key]: result.data },
        }
      }

      case 'element.extract_attribute': {
        activeTabId = await ensureTab(activeTabId)
        const result = await runDom(activeTabId, {
          action: 'extractAttribute',
          selector,
          attribute: String(params.attribute ?? 'href'),
          timeoutMs: args.timeoutMs,
        })
        if (!result.ok) throw new Error(result.error)
        const key = String(params.outputKey ?? 'extractedAttr')
        return {
          status: 'success',
          activeTabId,
          output: result.data,
          variables: { [key]: result.data },
        }
      }

      case 'wait.delay': {
        await sleep(Number(params.ms ?? 1000))
        return { status: 'success' }
      }

      case 'wait.random': {
        const min = Number(params.minMs ?? 500)
        const max = Number(params.maxMs ?? 1500)
        const ms = Math.floor(min + Math.random() * Math.max(0, max - min))
        await sleep(ms)
        return { status: 'success', output: { ms } }
      }

      case 'wait.until_url': {
        activeTabId = await ensureTab(activeTabId)
        const needle = String(params.includes ?? '')
        const started = Date.now()
        while (Date.now() - started < args.timeoutMs) {
          const tab = await chrome.tabs.get(activeTabId)
          if (tab.url?.includes(needle)) return { status: 'success', activeTabId }
          await sleep(250)
        }
        const err = new Error('URL wait timed out')
        err.name = 'TimeoutError'
        throw err
      }

      case 'variables.set': {
        const key = String(params.key ?? '')
        return { status: 'success', variables: { [key]: params.value } }
      }

      case 'variables.append': {
        const key = String(params.key ?? '')
        if (!key) throw new Error('variables.append needs a key')
        const prev = args.variables[key]
        const prevText = prev == null ? '' : String(prev)
        const nextText = interpolate(String(params.text ?? ''), args.variables)
        const separator = String(params.separator ?? '')
        const joined = `${prevText}${separator}${nextText}`
        return { status: 'success', variables: { [key]: joined }, output: joined }
      }

      case 'variables.delete': {
        return {
          status: 'success',
          variables: { [String(params.key ?? '')]: undefined },
        }
      }

      case 'conditions.if': {
        const waitBeforeMs = Math.max(0, Number(params.waitBeforeMs ?? 0))
        if (waitBeforeMs > 0) await sleep(waitBeforeMs)

        const checkType = String(params.checkType ?? 'variable')
        const waitMs = Math.max(0, Number(params.waitMs ?? 2500))
        const negate = Boolean(params.negate)
        let ok = false
        let detail: unknown = null

        if (checkType === 'variable') {
          const left = interpolate(String(params.left ?? ''), args.variables)
          const right = interpolate(String(params.right ?? ''), args.variables)
          ok = evaluateCondition(left, String(params.operator ?? 'equals'), right)
          detail = { left, right, operator: params.operator }
        } else {
          activeTabId = await ensureTab(activeTabId)
          const kind =
            checkType === 'element_visible' ||
            checkType === 'element_exists' ||
            checkType === 'element_clickable' ||
            checkType === 'button_name' ||
            checkType === 'element_number' ||
            checkType === 'text_present' ||
            checkType === 'text_gone'
              ? checkType
              : 'element_visible'
          const compareValue = interpolate(
            String(params.right ?? params.compareValue ?? ''),
            args.variables,
          )
          const result = await runDom(activeTabId, {
            action: 'checkCondition',
            selector: selector || String(params.selector ?? '') || undefined,
            text: interpolate(String(params.text ?? params.buttonName ?? ''), args.variables),
            timeoutMs: waitMs,
            options: {
              kind,
              exact: Boolean(params.exact),
              matchMode: String(params.matchMode ?? 'contains'),
              operator:
                checkType === 'element_number'
                  ? String(params.operator ?? 'gt')
                  : String(params.operator ?? 'equals'),
              compareValue,
            },
          })
          if (!result.ok) throw new Error(result.error)
          ok = Boolean((result.data as { matched?: boolean } | undefined)?.matched)
          detail = result.data
        }

        if (negate) ok = !ok
        const numberFromElement =
          detail && typeof detail === 'object' && 'number' in detail
            ? (detail as { number?: number | null }).number
            : undefined
        return {
          status: 'success',
          branch: ok ? 'true' : 'false',
          activeTabId,
          output: { ok, checkType, detail },
          variables: {
            __lastCondition: ok,
            ...(typeof numberFromElement === 'number'
              ? { __lastElementNumber: numberFromElement }
              : {}),
          },
        }
      }

      case 'conditions.switch': {
        const waitBeforeMs = Math.max(0, Number(params.waitBeforeMs ?? 0))
        if (waitBeforeMs > 0) await sleep(waitBeforeMs)

        const sourceType = String(params.sourceType ?? 'variable')
        const waitMs = Math.max(0, Number(params.waitMs ?? 2500))
        const matchMode = String(params.matchMode ?? 'equals')
        let value = ''

        if (sourceType === 'variable') {
          value = interpolate(String(params.value ?? ''), args.variables)
        } else {
          activeTabId = await ensureTab(activeTabId)
          const kind =
            sourceType === 'element_attribute' ? 'element_attribute' : 'element_text'
          const result = await runDom(activeTabId, {
            action: 'checkCondition',
            selector: selector || String(params.selector ?? '') || undefined,
            attribute: String(params.attribute ?? 'href'),
            timeoutMs: waitMs,
            options: { kind },
          })
          if (!result.ok) throw new Error(result.error)
          value = String((result.data as { value?: string } | undefined)?.value ?? '')
        }

        const cases = String(params.cases ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)

        let matched: string | undefined
        for (const caseValue of cases) {
          if (matchMode === 'contains' && value.includes(caseValue)) {
            matched = caseValue
            break
          }
          if (matchMode === 'starts_with' && value.startsWith(caseValue)) {
            matched = caseValue
            break
          }
          if (matchMode === 'regex') {
            try {
              if (new RegExp(caseValue, 'i').test(value)) {
                matched = caseValue
                break
              }
            } catch {
              /* ignore bad regex */
            }
            continue
          }
          if (matchMode === 'equals' || !matchMode) {
            if (value === caseValue) {
              matched = caseValue
              break
            }
          }
        }

        const branch = matched ?? 'default'
        return {
          status: 'success',
          branch,
          activeTabId,
          output: { value, branch, cases },
          variables: { __lastSwitchValue: value, __lastSwitchBranch: branch },
        }
      }

      case 'ai.chatgpt_prompt': {
        const response = await chatGptModule.runPrompt(String(params.prompt ?? ''))
        return {
          status: 'success',
          output: response,
          variables: { lastChatGptResponse: response },
        }
      }

      case 'logging.info':
      case 'logging.error':
      case 'logging.success': {
        const level =
          args.actionId === 'logging.error'
            ? 'error'
            : args.actionId === 'logging.success'
              ? 'success'
              : 'info'
        await activityLog.append(level, 'Planner', String(params.message ?? ''))
        return { status: 'success' }
      }

      case 'data.json_parse': {
        const source = interpolate(String(params.source ?? ''), args.variables)
        const parsed = JSON.parse(source)
        const key = String(params.outputKey ?? 'parsed')
        return { status: 'success', variables: { [key]: parsed }, output: parsed }
      }

      case 'data.regex_extract': {
        const source = interpolate(String(params.source ?? ''), args.variables)
        const pattern = String(params.pattern ?? '')
        const group = Number(params.group ?? 1)
        const key = String(params.outputKey ?? 'extracted')
        const match = source.match(new RegExp(pattern, 'i'))
        const value = match?.[group] ?? match?.[0] ?? ''
        if (!value) throw new Error(`Regex did not match: ${pattern}`)
        return { status: 'success', variables: { [key]: value }, output: value }
      }

      case 'downloads.save_text': {
        const text = interpolate(String(params.text ?? ''), args.variables)
        const filename = interpolate(String(params.filename ?? 'output.json'), args.variables)
        const url = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`
        const downloadId = await downloadManager.download({
          url,
          filename,
          conflictAction: 'uniquify',
        })
        return { status: 'success', output: { downloadId, filename }, variables: { lastDownloadId: downloadId } }
      }

      case 'data.replace': {
        const source = interpolate(String(params.source ?? ''), args.variables)
        const replaced = source.replaceAll(
          String(params.search ?? ''),
          String(params.replaceWith ?? ''),
        )
        const key = String(params.outputKey ?? 'replaced')
        return { status: 'success', variables: { [key]: replaced }, output: replaced }
      }

      case 'data.trim': {
        const source = interpolate(String(params.source ?? ''), args.variables).trim()
        const key = String(params.outputKey ?? 'trimmed')
        return { status: 'success', variables: { [key]: source }, output: source }
      }

      case 'clipboard.copy_event': {
        // Unified Copy Event: pick Copy button → click → capture → store (+ format/name).
        const sourceMode = String(params.sourceMode ?? 'click_copy_button')
        const nameTemplate = String(params.name ?? '').trim() || 'story-{_NumberAuto}'
        const format = params.format === 'json' ? 'json' : 'text'
        const shouldStore = params.store !== false && params.store !== 'false'
        const shouldCopy = params.copy !== false
        const outputKey = String(params.outputKey ?? 'copiedText').trim() || 'copiedText'
        const clickDelayMs = Math.max(0, Number(params.clickDelayMs ?? 250))

        let text = ''

        if (sourceMode === 'manual_or_variable') {
          text = String(params.text ?? '')
        } else if (sourceMode === 'extract_from_element') {
          if (!selector) throw new Error('Pick the text element (selector required)')
          activeTabId = await ensureTab(activeTabId)
          const extracted = await runDom(activeTabId, {
            action: 'extractText',
            selector,
            timeoutMs: args.timeoutMs,
          })
          if (!extracted.ok) throw new Error(extracted.error ?? 'Failed to extract text')
          text = String(extracted.data ?? '')
        } else {
          // click_copy_button (default): click picked Copy button → read OS clipboard
          if (!selector) throw new Error('Pick the Copy button with mouse (selector required)')
          activeTabId = await ensureTab(activeTabId)
          const clicked = await runDom(activeTabId, {
            action: 'click',
            selector,
            timeoutMs: args.timeoutMs,
          })
          if (!clicked.ok) {
            throw Object.assign(new Error(clicked.error ?? 'Copy button click failed'), {
              name: 'ElementNotFoundError',
            })
          }
          if (clickDelayMs > 0) await sleep(clickDelayMs)

          const read = await runDom(activeTabId, { action: 'readClipboard' })
          if (read.ok && typeof read.data === 'string' && read.data.length > 0) {
            text = read.data
          } else {
            // Fallback: some UIs copy via selection; try reading nearby message text if click target fails
            const fallback = await runDom(activeTabId, {
              action: 'extractText',
              selector:
                '[data-message-author-role="assistant"]:last-of-type, [data-testid="conversation-turn-"]:last-of-type',
              timeoutMs: Math.min(args.timeoutMs, 8000),
            })
            if (fallback.ok && typeof fallback.data === 'string' && fallback.data.trim()) {
              text = String(fallback.data).trim()
              await activityLog.append(
                'warn',
                'CopyEvent',
                'Clipboard empty after Copy click — used last assistant message text as fallback',
              )
            } else {
              throw new Error(
                read.error ||
                  'Clipboard empty after clicking Copy button. Allow clipboard permission or use Extract/Manual mode.',
              )
            }
          }
        }

        const persisted = await persistCopyResult({
          text,
          variables: args.variables,
          workflowId: args.workflowId,
          nameTemplate,
          format,
          shouldStore,
          shouldCopy,
          activeTabId,
          runDom,
        })
        activeTabId = persisted.activeTabId

        return {
          status: 'success',
          activeTabId,
          variables: {
            __clipboard: persisted.clipboardPayload,
            [outputKey]: text,
            ...persisted.storePatch,
          },
          output: {
            text,
            clipboardPayload: persisted.clipboardPayload,
            clipboardOk: persisted.clipboardOk,
            clipboardError: persisted.clipboardError,
            storedAs: persisted.entryName,
            format,
            sourceMode,
          },
        }
      }

      case 'clipboard.write': {
        // Existing behavior: always mirror into __clipboard.
        // Additive: optional OS clipboard + workflow-scoped Copy Store.
        const text = String(params.text ?? '')
        const shouldCopy = params.copy !== false
        const nameTemplate = String(params.name ?? '').trim()
        const format = params.format === 'json' ? 'json' : 'text'
        // Default store=false keeps legacy nodes unchanged.
        const shouldStore = params.store === true || params.store === 'true'

        const persisted = await persistCopyResult({
          text,
          variables: args.variables,
          workflowId: args.workflowId,
          nameTemplate,
          format,
          shouldStore,
          shouldCopy,
          activeTabId,
          runDom,
        })
        activeTabId = persisted.activeTabId

        return {
          status: 'success',
          activeTabId,
          variables: {
            __clipboard: persisted.clipboardPayload,
            ...persisted.storePatch,
          },
          output: {
            text,
            clipboardPayload: persisted.clipboardPayload,
            clipboardOk: persisted.clipboardOk,
            clipboardError: persisted.clipboardError,
            storedAs: persisted.entryName,
            format,
          },
        }
      }

      case 'clipboard.read': {
        const key = String(params.outputKey ?? 'clipboard')
        let value = args.variables.__clipboard ?? ''
        try {
          activeTabId = await ensureTab(activeTabId)
          const result = await runDom(activeTabId, { action: 'readClipboard' })
          if (result.ok && typeof result.data === 'string') {
            value = result.data
          }
        } catch {
          // Keep in-memory __clipboard mirror (existing behavior)
        }
        return {
          status: 'success',
          activeTabId,
          variables: { [key]: value, __clipboard: value },
          output: value,
        }
      }

      case 'screenshot.full': {
        await activityLog.append('info', 'Planner', `Screenshot marker: ${String(params.label ?? '')}`)
        return { status: 'success' }
      }

      case 'loops.for':
      case 'loops.while':
      case 'loops.foreach':
      case 'loops.break':
      case 'loops.continue':
        return { status: 'success', branch: args.actionId }

      default:
        await activityLog.append(
          'warn',
          'Planner',
          `Action registered but executor stub: ${args.actionId}`,
        )
        return { status: 'success', output: { stub: true, actionId: args.actionId } }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const status = err.name === 'TimeoutError' ? 'timeout' : 'failed'
    return { status, error: err.message, activeTabId }
  }
}
