import { onRuntimeMessage } from '@/shared/messaging/bus'
import { executeDomCommand } from '@/engine/automation/dom-actions'
import { startElementPicker } from '@/content/element-picker'
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
        void chrome.runtime.sendMessage({
          type: 'PICK_ELEMENT_RESULT',
          payload: { ok: true, picked },
        })
      })
      .catch((error: unknown) => {
        void chrome.runtime.sendMessage({
          type: 'PICK_ELEMENT_RESULT',
          payload: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      })
      .finally(() => {
        picking = false
      })

    return { ok: true, started: true }
  }

  return undefined
})
