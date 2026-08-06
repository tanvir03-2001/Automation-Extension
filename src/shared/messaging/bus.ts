import type { ExtensionMessage } from '@/shared/types/messages'

export async function sendRuntimeMessage<TResponse = unknown, TPayload = unknown>(
  message: ExtensionMessage<TPayload>,
): Promise<TResponse> {
  return chrome.runtime.sendMessage(message) as Promise<TResponse>
}

export async function sendTabMessage<TResponse = unknown, TPayload = unknown>(
  tabId: number,
  message: ExtensionMessage<TPayload>,
): Promise<TResponse> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<TResponse>
}

export function onRuntimeMessage<TPayload = unknown, TResponse = unknown>(
  handler: (
    message: ExtensionMessage<TPayload>,
    sender: chrome.runtime.MessageSender,
  ) => Promise<TResponse> | TResponse | void,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message as ExtensionMessage<TPayload>, sender)

    if (result instanceof Promise) {
      result
        .then((value) => sendResponse(value))
        .catch((error: unknown) => {
          const err = error instanceof Error ? error.message : String(error)
          sendResponse({ ok: false, error: err })
        })
      return true
    }

    if (result !== undefined) {
      sendResponse(result)
    }

    return false
  })
}
