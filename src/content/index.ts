import { onRuntimeMessage } from '@/shared/messaging/bus'
import { executeDomCommand } from '@/engine/automation/dom-actions'
import {
  isElementPickerActive,
  startElementPicker,
  stopElementPicker,
} from '@/content/element-picker'
import {
  isRunGuardLocked,
  lockRunGuard,
  refreshRunGuard,
  unlockRunGuard,
  withGuardBypass,
} from '@/content/run-guard'
import type { AutomationCommand } from '@/shared/types/messages'

let picking = false

onRuntimeMessage(async (message) => {
  if (message.type === 'CONTENT_PING') {
    return { ok: true, pong: true, runGuardLocked: isRunGuardLocked() }
  }

  if (message.type === 'RUN_GUARD_LOCK') {
    const payload = (message.payload ?? {}) as { message?: string }
    return lockRunGuard(payload.message)
  }

  if (message.type === 'RUN_GUARD_UNLOCK') {
    return unlockRunGuard()
  }

  if (message.type === 'RUN_GUARD_REFRESH') {
    return refreshRunGuard()
  }

  if (message.type === 'AUTOMATION_COMMAND') {
    if (isRunGuardLocked()) refreshRunGuard()
    const command = message.payload as AutomationCommand
    // Lift the lock overlay while automation focuses/types/pastes into the page
    return withGuardBypass(() => executeDomCommand(command))
  }

  if (message.type === 'PICK_ELEMENT_START') {
    if (picking) {
      return { ok: false, error: 'Element picker already active on this page' }
    }

    // Don't fight the run guard while picking
    if (isRunGuardLocked()) unlockRunGuard()

    picking = true

    // Ack immediately so the service worker does not hold a long tabs.sendMessage channel.
    // Result is delivered via PICK_ELEMENT_RESULT.
    void startElementPicker()
      .then((picked) => {
        if (!isElementPickerActive()) picking = false
        void chrome.runtime.sendMessage({
          type: 'PICK_ELEMENT_RESULT',
          payload: { ok: true, picked },
        })
      })
      .catch((error: unknown) => {
        if (!isElementPickerActive()) picking = false
        const messageText = error instanceof Error ? error.message : String(error)
        // Background already settled (another tab won / UI Cancel / superseded pick).
        if (/pick session ended|previous pick cancelled/i.test(messageText)) {
          return
        }
        void chrome.runtime.sendMessage({
          type: 'PICK_ELEMENT_RESULT',
          payload: {
            ok: false,
            error: messageText,
          },
        })
      })

    return { ok: true, started: true }
  }

  if (message.type === 'PICK_ELEMENT_STOP') {
    const reason =
      typeof (message.payload as { reason?: string } | undefined)?.reason === 'string'
        ? (message.payload as { reason: string }).reason
        : 'Pick session ended'
    stopElementPicker(reason)
    picking = false
    return { ok: true, stopped: true }
  }

  return undefined
})
