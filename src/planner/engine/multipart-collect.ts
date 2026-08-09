import { ensureContentScript } from '@/background/ensure-content-script'
import { runGuardController } from '@/background/run-guard-controller'
import { activityLog } from '@/engine/activity/activity-log'
import { downloadManager } from '@/modules/download/download-manager'
import { sleep } from '@/engine/retry/retry-policy'
import { sendTabMessage } from '@/shared/messaging/bus'
import type { AutomationCommand } from '@/shared/types/messages'

const ASSISTANT_SELECTORS = [
  '[data-message-author-role="assistant"]:last-of-type',
  '[data-message-author-role="assistant"]:last-child',
  'article[data-testid*="conversation-turn"]:last-of-type',
]

const COMPOSER_SELECTOR =
  '#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"]'

const SEND_SELECTOR =
  'button[data-testid="send-button"], button[data-testid="composer-send-button"], button[aria-label*="Send"]'

export const PART_COUNT_PROMPT = `The previous response returned OUTPUT_LIMIT_REACHED / success:false because the full JSON is too long for one reply.

I need the COMPLETE JSON delivered in multiple parts.

Reply with ONLY this exact JSON object (no markdown fences, no explanation, no extra keys):
{"partCount":NUMBER,"ready":true}

STRICT RULES for the parts you will send next:
1. partCount = minimum number of parts you need (integer 2–12).
2. Later I will ask for Part 1, Part 2, … Part N.
3. Each part must be RAW text only (no \`\`\` fences, no commentary, no "Part X" labels).
4. When I concatenate Part1+Part2+…+PartN with ZERO edits/spaces added/removed at the joins, the result MUST be one complete valid JSON document.
5. Do not restart the JSON in later parts - continue exactly from the previous cut.
6. Prefer cutting between JSON properties/array items when possible.`

export function buildPartPrompt(partIndex: number, partCount: number): string {
  return `Give me Part ${partIndex} of ${partCount} now.

STRICT RULES:
1. Output ONLY the raw text for this part - no markdown code fences, no commentary, no labels like "Part ${partIndex}".
2. When I join Part1+Part2+…+Part${partCount} with ZERO changes, the result must be one complete valid JSON document.
3. Do not repeat content from earlier parts.
4. Do not restart from the beginning - continue exactly where Part ${Math.max(1, partIndex - 1)} ended.
5. Never explain anything. Never ask questions.`
}

async function runDom(
  tabId: number,
  command: AutomationCommand,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  await ensureContentScript(tabId)
  if (runGuardController.isEnabled()) {
    await runGuardController.lockTab(tabId)
  }
  return sendTabMessage(tabId, { type: 'AUTOMATION_COMMAND', payload: command })
}

function stripCodeFences(text: string): string {
  let t = text.trim()
  // ```json ... ``` or ``` ... ```
  const fenced = t.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/)
  if (fenced?.[1]) return fenced[1].trim()
  // leading/trailing fence lines mixed with other text
  t = t.replace(/^```(?:json|JSON)?\s*/i, '').replace(/\s*```$/i, '')
  return t.trim()
}

function tryParseJson(text: string): unknown | null {
  const cleaned = stripCodeFences(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try to extract first {...} block
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function isOutputLimitResponse(text: string): boolean {
  const raw = text || ''
  if (/OUTPUT_LIMIT_REACHED/i.test(raw)) return true
  const parsed = tryParseJson(raw)
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    if (obj.success === false) {
      const err = obj.error as Record<string, unknown> | undefined
      if (String(err?.code ?? '').includes('OUTPUT_LIMIT')) return true
      if (/output limit|exceeds the maximum response/i.test(String(err?.message ?? ''))) {
        return true
      }
    }
  }
  return false
}

export function isCompleteSuccessJson(text: string): boolean {
  const parsed = tryParseJson(text)
  if (!parsed || typeof parsed !== 'object' || parsed === null) return false
  const obj = parsed as Record<string, unknown>
  if (obj.success === false) return false
  if (obj.story != null) return true
  if (obj.success === true) return true
  // Any parseable JSON object without the limit error counts as usable single response
  return !isOutputLimitResponse(text)
}

export function extractPartCount(text: string): number | null {
  const parsed = tryParseJson(text)
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    const n = Number(obj.partCount ?? obj.parts ?? obj.totalParts)
    if (Number.isFinite(n) && n >= 1) return Math.floor(n)
  }

  const patterns = [
    /"partCount"\s*:\s*(\d+)/i,
    /partCount\s*[:=]\s*(\d+)/i,
    /(\d+)\s*parts?/i,
    /parts?\s*[:=]\s*(\d+)/i,
    /in\s+(\d+)\s+parts?/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n >= 1) return Math.floor(n)
    }
  }
  return null
}

async function extractAssistantText(tabId: number, timeoutMs: number): Promise<string> {
  let lastError = 'No assistant message found'
  for (const selector of ASSISTANT_SELECTORS) {
    const result = await runDom(tabId, {
      action: 'extractText',
      selector,
      timeoutMs: Math.min(timeoutMs, 20_000),
    })
    if (result.ok && String(result.data ?? '').trim()) {
      return String(result.data).trim()
    }
    lastError = result.error ?? lastError
  }
  throw new Error(`Could not copy ChatGPT response: ${lastError}`)
}

async function pasteSendWait(tabId: number, text: string, timeoutMs: number): Promise<void> {
  const paste = await runDom(tabId, {
    action: 'paste',
    selector: COMPOSER_SELECTOR,
    value: text,
    timeoutMs: Math.max(timeoutMs, 60_000),
  })
  if (!paste.ok) throw new Error(paste.error ?? 'Paste failed')

  await sleep(600)

  const send = await runDom(tabId, {
    action: 'clickSend',
    selector: SEND_SELECTOR,
    timeoutMs: 20_000,
  })
  if (!send.ok) throw new Error(send.error ?? 'Send failed')

  const wait = await runDom(tabId, {
    action: 'waitForGenerationEnd',
    timeoutMs: Math.max(timeoutMs, 180_000),
  })
  if (!wait.ok) throw new Error(wait.error ?? 'Timed out waiting for ChatGPT response')

  // Small settle so DOM text is final
  await sleep(800)
}

async function saveTextFile(text: string, filename: string): Promise<number> {
  // data: URL is reliable from the MV3 service worker (no Blob URL lifecycle issues)
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`
  return downloadManager.download({
    url,
    filename,
    conflictAction: 'uniquify',
  })
}

export type MultipartCollectResult = {
  mode: 'single' | 'multipart' | 'saved_raw'
  finalJson: string
  partCount: number
  parts: string[]
  downloadId?: number
  filename: string
  validJson: boolean
}

export async function collectJsonParts(args: {
  activeTabId: number
  timeoutMs: number
  maxParts?: number
  filename?: string
  /** Already-copied first response; if omitted, reads from page */
  firstResponse?: string
  autoDownload?: boolean
}): Promise<MultipartCollectResult> {
  const tabId = args.activeTabId
  const timeoutMs = args.timeoutMs || 300_000
  const maxParts = Math.min(Math.max(Number(args.maxParts ?? 12), 2), 20)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = args.filename?.trim() || `chatgpt-story-${stamp}.json`
  const autoDownload = args.autoDownload !== false

  await activityLog.append('info', 'MultipartCollect', 'Reading first ChatGPT response…')
  const first = (args.firstResponse ?? (await extractAssistantText(tabId, timeoutMs))).trim()

  // Happy path: complete JSON in one shot
  if (isCompleteSuccessJson(first) && !isOutputLimitResponse(first)) {
    const finalJson = stripCodeFences(first)
    let downloadId: number | undefined
    if (autoDownload) {
      downloadId = await saveTextFile(finalJson, filename)
    }
    await activityLog.append('success', 'MultipartCollect', `Single-response JSON saved (${finalJson.length} chars)`)
    return {
      mode: 'single',
      finalJson,
      partCount: 1,
      parts: [finalJson],
      downloadId,
      filename,
      validJson: tryParseJson(finalJson) != null,
    }
  }

  if (!isOutputLimitResponse(first)) {
    // Not a limit error - still save whatever we got
    const finalJson = stripCodeFences(first)
    let downloadId: number | undefined
    if (autoDownload) {
      downloadId = await saveTextFile(finalJson, filename)
    }
    await activityLog.append(
      'warn',
      'MultipartCollect',
      'Response was not OUTPUT_LIMIT_REACHED; saved raw response',
    )
    return {
      mode: 'saved_raw',
      finalJson,
      partCount: 1,
      parts: [finalJson],
      downloadId,
      filename,
      validJson: tryParseJson(finalJson) != null,
    }
  }

  await activityLog.append(
    'info',
    'MultipartCollect',
    'OUTPUT_LIMIT_REACHED detected - asking ChatGPT for partCount…',
  )

  await pasteSendWait(tabId, PART_COUNT_PROMPT, timeoutMs)
  const countReply = await extractAssistantText(tabId, timeoutMs)
  let partCount = extractPartCount(countReply) ?? 0
  if (partCount < 2) {
    await activityLog.append(
      'warn',
      'MultipartCollect',
      `Could not parse partCount from reply; defaulting to 4. Reply snippet: ${countReply.slice(0, 160)}`,
    )
    partCount = 4
  }
  partCount = Math.min(partCount, maxParts)

  await activityLog.append('info', 'MultipartCollect', `Will collect ${partCount} parts`)

  const parts: string[] = []
  for (let i = 1; i <= partCount; i += 1) {
    await activityLog.append('info', 'MultipartCollect', `Requesting Part ${i}/${partCount}…`)
    await pasteSendWait(tabId, buildPartPrompt(i, partCount), timeoutMs)
    const partRaw = await extractAssistantText(tabId, timeoutMs)
    const part = stripCodeFences(partRaw)
    if (!part.trim()) {
      throw new Error(`Part ${i}/${partCount} was empty`)
    }
    parts.push(part)
    await activityLog.append(
      'success',
      'MultipartCollect',
      `Stored Part ${i}/${partCount} (${part.length} chars)`,
    )
    // Brief pause between parts for UI stability
    await sleep(500)
  }

  const finalJson = parts.join('')
  const validJson = tryParseJson(finalJson) != null
  if (!validJson) {
    await activityLog.append(
      'warn',
      'MultipartCollect',
      'Joined parts are not valid JSON yet - file still saved for manual fix',
    )
  } else {
    await activityLog.append('success', 'MultipartCollect', 'Joined parts form valid JSON')
  }

  let downloadId: number | undefined
  if (autoDownload) {
    downloadId = await saveTextFile(finalJson, filename)
  }

  return {
    mode: 'multipart',
    finalJson,
    partCount,
    parts,
    downloadId,
    filename,
    validJson,
  }
}
