import { getActionById, ACTION_LIBRARY } from '@/planner/actions/catalog'
import type { ActionDefinition } from '@/planner/actions/types'

const EXTRA_HOWTO: Record<string, string[]> = {
  'browser.open_url': [
    'Drag Open URL onto the canvas.',
    'Enter the website address (example: https://chatgpt.com/).',
    'Connect Start → Open URL with the green dots.',
    'If “Reuse existing tab” is on, an already-open tab is focused instead of opening another.',
  ],
  'ai.open_chatgpt': [
    'Opens ChatGPT or focuses it if the tab is already open.',
    'Connect it after Start, then usually Wait For Page.',
    'No coding needed — just connect the green dots in order.',
  ],
  'browser.wait_for_page': [
    'Pauses until the page finishes loading.',
    'Place it after Open URL / Open ChatGPT so the next click is reliable.',
  ],
  'mouse.click': [
    'Clicks a button or link on the page.',
    'Select the step → use “Pick with mouse” to choose the real button (example: New chat).',
    'Connect it before Type Text when you need a fresh chat.',
  ],
  'keyboard.type_text': [
    'Types text into the focused box (or a picked selector).',
    'Choose Manual text, or a Text library like Story Title.',
    'In Prompt template, write a full sentence and insert {_Story Title} (type {_ to pick a library).',
    'If several titles are selected, each loop fills the next title into the template.',
    'Use human-like typing speed for ChatGPT-style editors.',
  ],
  'keyboard.paste_text': [
    'Same features as Type Text (manual, library, {_Story Title} template, queue).',
    'Instead of typing letter by letter, pastes the whole prompt instantly.',
    'Faster for long prompts — use when you do not need human-like typing.',
    'Connect it after New chat / focus, then usually Click Send.',
  ],
  'ai.click_send': [
    'Clicks the Send button after text is typed.',
    'Pick the Send button with the mouse if the default selector fails.',
  ],
  'ai.wait_response': [
    'Waits until the AI finishes generating (Stop button disappears).',
    'Place it after Send, before Collect JSON Parts or Repeat If More Titles.',
  ],
  'clipboard.copy_event': [
    'One event for the full copy pipeline — pick, click, capture, name, format, store.',
    'Use “Pick Copy button” and click the real Copy control on the page.',
    'Default source: click that button → read clipboard → save as story-{_NumberAuto}.',
    'Later steps can use {{COPY:story-1}} (and COPY_NAME / COPY_NUMBER).',
    'Other modes: extract text from an element, or paste {{aiResponse}} manually.',
  ],
  'ai.collect_json_parts': [
    'Place after Wait Response.',
    'If ChatGPT returned a complete JSON story, it downloads that file.',
    'If it returned OUTPUT_LIMIT_REACHED / success:false, it asks how many parts are needed.',
    'Then it requests Part 1…N, copies each reply, joins with zero edits, and downloads the full JSON.',
    'Each step waits until generation fully ends — long stories need long timeouts.',
  ],
  'flow.repeat_if_more': [
    'Used after TypeText from a text library with multiple titles.',
    'In Properties, pick which step to jump back to (usually “Click · New chat”).',
    'You do not need to type node IDs — use the dropdown.',
    'If more titles remain, the flow jumps back; otherwise it continues to End.',
  ],
  'flow.goto_step': [
    'Jumps to another step you choose from the dropdown.',
    'Useful for custom loops or skipping ahead.',
  ],
  'element.wait_visible': [
    'Waits until a picked element or icon is visible on screen.',
    'Use Pick with mouse on the target element.',
  ],
  'element.if_visible': [
    'Checks whether a picked button/element is visible (does not fail if missing).',
    'Green true handle → path when it IS visible (usually Click that button).',
    'Red false handle → path when it is NOT visible (click a different button).',
    'Pick the preferred button with mouse; leave the false-path Click for the fallback button.',
  ],
  'conditions.if': [
    'Open Properties and choose “Check what?” — element visible, button name, page text, or variable.',
    'Use Pick with mouse for elements, or type a button label like Continue / Send.',
    'Wait before = pause first; Check window = how long to keep looking.',
    'Connect green true and red false to different next steps.',
  ],
  'conditions.switch': [
    'Choose value from a variable, or pick an element to read its text/attribute.',
    'Enter cases comma-separated (Continue,Retry,Cancel) — each becomes a branch handle.',
    'Unmatched values go to the default handle.',
    'Wait before / Check window work the same as If.',
  ],
  'element.wait_hidden': [
    'Waits until the picked element is hidden or removed.',
  ],
  'element.wait_text': [
    'Waits until the given text appears anywhere in the page window.',
    'Choose Contains, Exact, or Regex match mode.',
  ],
  'element.wait_button': [
    'Waits for a button by its label (Send, Continue…) or by a picked selector.',
  ],
  'flow.start': [
    'Every workflow should begin with Start.',
    'Connect Start’s right green dot to the first real action.',
  ],
  'flow.end': [
    'Marks the end of the workflow.',
    'Connect the last action’s right green dot into End.',
  ],
}

const EXTRA_TOOLTIP: Record<string, string> = {
  'browser.open_url': 'Opens a website. Reuses the tab if that site is already open.',
  'ai.open_chatgpt': 'Opens ChatGPT, or focuses the existing ChatGPT tab.',
  'browser.wait_for_page': 'Waits until the page is fully loaded.',
  'mouse.click': 'Clicks a page element. Pick the target with your mouse.',
  'keyboard.type_text': 'Types text (manual or from a Story Title library).',
  'keyboard.paste_text':
    'Pastes full text instantly — same library & {_template} features as Type Text.',
  'ai.click_send': 'Clicks the chat Send button.',
  'ai.wait_response': 'Waits until ChatGPT finishes answering.',
  'clipboard.copy_event':
    'Pick Copy button → click → save to Copy Store (story-1, story-2…) in one step.',
  'ai.collect_json_parts':
    'If OUTPUT_LIMIT_REACHED, collects Part 1…N into one complete JSON and downloads it.',
  'flow.repeat_if_more': 'If more library titles remain, jump back and run again.',
  'flow.goto_step': 'Jump to another step you choose from a list.',
  'element.wait_visible': 'Wait until a picked element/icon appears.',
  'element.if_visible': 'If element visible → true path; otherwise → false path.',
  'conditions.if':
    'If/else on button, text, element, or variable — with mouse pick and wait.',
  'conditions.switch':
    'Multi-way branch on variable or picked element text — cases + default.',
  'element.wait_hidden': 'Wait until a picked element disappears.',
  'element.wait_text': 'Wait until text appears somewhere on the page.',
  'element.wait_button': 'Wait until a button is ready (by label or pick).',
  'flow.start': 'Starting point of the workflow.',
  'flow.end': 'Finishes the workflow.',
}

export function getActionTooltip(action: ActionDefinition | string): string {
  const def = typeof action === 'string' ? getActionById(action) : action
  if (!def) return 'Automation action'
  return def.tooltip ?? EXTRA_TOOLTIP[def.id] ?? def.description
}

export function getActionHowto(action: ActionDefinition | string): string[] {
  const def = typeof action === 'string' ? getActionById(action) : action
  if (!def) return ['Drag this action onto the canvas and connect it with green dots.']
  if (def.howto?.length) return def.howto
  if (EXTRA_HOWTO[def.id]) return EXTRA_HOWTO[def.id]
  return [
    def.description,
    'Drag it onto the canvas.',
    'Connect steps by dragging from one green dot to another.',
    'Click the step on the canvas to edit its options on the right.',
  ]
}

export function getActionDocs(actionId: string): {
  action: ActionDefinition
  tooltip: string
  howto: string[]
  fields: ActionDefinition['fields']
} | null {
  const action = getActionById(actionId) ?? ACTION_LIBRARY.find((item) => item.id === actionId)
  if (!action) return null
  return {
    action,
    tooltip: getActionTooltip(action),
    howto: getActionHowto(action),
    fields: action.fields,
  }
}
