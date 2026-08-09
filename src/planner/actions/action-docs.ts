import { getActionById, ACTION_LIBRARY } from '@/planner/actions/catalog'
import type { ActionDefinition } from '@/planner/actions/types'

const EXTRA_HOWTO: Record<string, string[]> = {
  'datasets.read': [
    'Reads a Workflow dataset (by name or id) into a variable.',
    'Optional path uses dotted keys / array indexes (e.g. title.0).',
    'Datasets are shared by every Plan inside the Workflow - no extra setup.',
  ],
  'datasets.write': [
    'Replaces the whole dataset JSON value.',
    'Prefer Update Dataset Path when you only need to change one nested field.',
  ],
  'datasets.update_path': [
    'Sets one nested path inside a dataset (creates intermediate objects/arrays as needed).',
  ],
  'wait.network_idle': [
    'Waits until the page resource timeline is quiet for Idle ms.',
    'Useful after navigation on JS-heavy sites before clicking.',
  ],
  'wait.dom_stable': [
    'Waits until the DOM stops mutating for Stable ms.',
    'Helps with SPA re-renders and late-injected overlays.',
  ],
  'element.dismiss_overlay': [
    'Tries common Close / backdrop controls and sends Escape.',
    'Pair with Interaction → Dismiss overlays on click-heavy steps.',
  ],
  'variables.get': [
    'Reads a variable path (e.g. item.title) into an output key for later steps.',
  ],
  'loops.for': [
    'Repeats N times using the same loop / return / completed wiring as Map.',
    'Use {{item}} / {{index}} (or your index variable) inside the body.',
  ],
  'loops.while': [
    'Continues looping while the condition is true (capped by Max iterations).',
    'Wire loop → body → return; completed when the condition fails.',
  ],
  'loops.continue': [
    'Skips the rest of the current Map/For body and advances to the next item.',
  ],
  'browser.open_url': [
    'Drag Open URL onto the canvas.',
    'Enter the website address (example: https://chatgpt.com/).',
    'Connect Start → Open URL with the green dots.',
    'If “Reuse existing tab” is on, an already-open tab is focused instead of opening another.',
  ],
  'browser.go_back': [
    'Same as the browser Back button for the automation tab.',
    'If there is no previous page, the step is skipped and the run continues (see Activity warn).',
    'Turn on “Fail if no history” only when Back must succeed. For a fixed page after logout, use Open URL.',
  ],
  'browser.go_forward': [
    'Same as the browser Forward button.',
    'If there is no forward page, the step is skipped and the run continues by default.',
  ],
  'ai.open_chatgpt': [
    'Opens ChatGPT or focuses it if the tab is already open.',
    'Connect it after Start, then usually Wait For Page.',
    'No coding needed - just connect the green dots in order.',
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
  'mouse.click_exact': [
    'Clicks the element whose visible text matches exactly (e.g. Continue).',
    'Type the exact label, or Pick with mouse to fill Exact text from the page.',
    'Partial matches are ignored - only a full label match is clicked.',
  ],
  'mouse.click_text': [
    'Finds text on the page (Contains or Exact) and clicks that control.',
    'Uses the same universal click engine as Click (CDP → MAIN → synthetic).',
    'Best when the label is visible but the selector is unstable.',
  ],
  'mouse.click_aria': [
    'Clicks by aria-label / title - ideal for icon buttons (Go back, Close, Menu).',
    'Same universal click engine as Click.',
  ],
  'mouse.click_button': [
    'Clicks button-like controls only (button, combobox, role=button, select triggers).',
    'Match by visible name with Contains or Exact.',
  ],
  'mouse.click_link': [
    'Clicks an <a> / role=link by visible text or href fragment.',
    'Same universal click engine as Click.',
  ],
  'mouse.click_coordinates': [
    'Clicks at viewport X/Y. If an element is under the point, promotes to its click host.',
    'Uses the same multi-strategy click engine.',
  ],
  'downloads.click_download': [
    'Dedicated download-button click - fires exactly one trusted click.',
    'Never retries with MAIN/synthetic/React fallbacks (avoids double downloads).',
    'Pick the Download control with your mouse before running.',
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
    'Faster for long prompts - use when you do not need human-like typing.',
    'Connect it after New chat / focus, then usually Click Send.',
  ],
  'keyboard.press_key': [
    'Pick any key from the full keyboard list (Enter, Esc, letters, F-keys…).',
    'Add Ctrl / Alt / Shift / Win for chords like Ctrl+Enter.',
    'The canvas node shows the selected keycaps.',
  ],
  'keyboard.shortcut': [
    'Press 2–3 keys together (Ctrl+C, Ctrl+Shift+Enter…).',
    'Same picker as Press Key - select modifiers plus one main key.',
  ],
  'ai.click_send': [
    'Clicks the Send button after text is typed.',
    'Pick the Send button with the mouse if the default selector fails.',
  ],
  'ai.wait_response': [
    'Waits until the AI finishes generating (Stop button disappears).',
    'Place it after Send, before Collect JSON Parts or Repeat If More Titles.',
  ],
  'clipboard.click_to_clipboard': [
    'Pick a page Copy button, then at runtime click it and keep the text on the clipboard.',
    'Also saves into {{clipboardText}} and __clipboard for later steps.',
    'Does not write to Copy Store - use Copy Event when you need story-1, story-2… names.',
  ],
  'clipboard.copy_event': [
    'One event for the full copy pipeline - pick, click, capture, name, format, store.',
    'Use “Pick Copy button” and click the real Copy control on the page.',
    'Default source: click that button → read clipboard → save as story-{_NumberAuto}.',
    'Later steps can use {{COPY:story-1}} (and COPY_NAME / COPY_NUMBER).',
    'Other modes: extract text from an element, or paste {{aiResponse}} manually.',
  ],
  'loops.map': [
    'Four handles: in (start), loop (body), return (next item), completed (done).',
    'In Properties: Section dropdown (Text libraries / Copy Store) → then pick the list inside.',
    'Wire: previous → in; loop → body; last body step → return; completed → after-loop steps.',
    'Inside the body use {{item}} and {{index}}.',
    'Break inside the body skips remaining items and exits via completed.',
  ],
  'ai.collect_json_parts': [
    'Place after Wait Response.',
    'If ChatGPT returned a complete JSON story, it downloads that file.',
    'If it returned OUTPUT_LIMIT_REACHED / success:false, it asks how many parts are needed.',
    'Then it requests Part 1…N, copies each reply, joins with zero edits, and downloads the full JSON.',
    'Each step waits until generation fully ends - long stories need long timeouts.',
  ],
  'flow.repeat_if_more': [
    'Used after TypeText from a text library with multiple titles.',
    'In Properties, pick which step to jump back to (usually “Click · New chat”).',
    'You do not need to type node IDs - use the dropdown.',
    'If more titles remain, the flow jumps back; otherwise it continues to End.',
  ],
  'flow.goto_step': [
    'Jumps to another step you choose from the dropdown.',
    'Useful for custom loops or skipping ahead.',
  ],
  'flow.next_plan_execute': [
    'Hands off the run to another Plan inside the same Workflow.',
    'In Properties, pick the Target plan from the dropdown (same Workflow only).',
    'Plan list order does not matter - only your selected Plan starts next.',
    'You can chain Plans (A → C → D). Plans that are not selected never auto-run.',
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
    'Open Properties and choose “Check what?” - element visible, button name, number from element, page text, or variable.',
    'Number from element: Pick the balance/credits box (e.g. 118), then compare Greater / Less / Equals to your number.',
    'Use Pick with mouse for elements, or type a button label like Continue / Send.',
    'Wait before = pause first; Check window = how long to keep looking.',
    'Connect green true and red false to different next steps.',
  ],
  'conditions.switch': [
    'Choose value from a variable, or pick an element to read its text/attribute.',
    'Enter cases comma-separated (Continue,Retry,Cancel) - each becomes a branch handle.',
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
  'flow.connector': [
    'Does not run any page action - it only sits on the canvas as a labeled connector.',
    'Rename the Label in Properties to a big section title (e.g. “Login”, “Download”).',
    'Wire steps through it so the graph stays readable.',
  ],
}

const EXTRA_TOOLTIP: Record<string, string> = {
  'browser.open_url': 'Opens a website. Reuses the tab if that site is already open.',
  'ai.open_chatgpt': 'Opens ChatGPT, or focuses the existing ChatGPT tab.',
  'browser.wait_for_page': 'Waits until the page is fully loaded.',
  'mouse.click': 'Clicks a page element. Pick the target with your mouse.',
  'mouse.click_exact':
    'Clicks by exact text/label match. Pick with mouse or type the full label.',
  'mouse.click_text': 'Find text on the page and click it (contains or exact).',
  'mouse.click_aria': 'Click by aria-label - great for icon-only controls.',
  'mouse.click_button': 'Click a button/combobox by its visible name.',
  'mouse.click_link': 'Click a link by text or href.',
  'mouse.click_coordinates': 'Click at X/Y using the universal click engine.',
  'downloads.click_download':
    'Single-click only for Download buttons - pick with mouse; never double-clicks.',
  'keyboard.type_text': 'Types text (manual or from a Story Title library).',
  'keyboard.paste_text':
    'Pastes full text instantly - same library & {_template} features as Type Text.',
  'keyboard.press_key': 'Pick any key (or Ctrl/Alt/Shift chord) from the keyboard list.',
  'keyboard.shortcut': 'Press multiple keys together - same picker, chord-focused.',
  'ai.click_send': 'Clicks the chat Send button.',
  'ai.wait_response': 'Waits until ChatGPT finishes answering.',
  'clipboard.click_to_clipboard':
    'Click a Copy button and keep the result on the clipboard ({{clipboardText}}).',
  'clipboard.copy_event':
    'Pick Copy button → click → save to Copy Store (story-1, story-2…) in one step.',
  'loops.map':
    'Pick Text libraries or Copy Store from nested dropdowns; loop / return / completed handles.',
  'ai.collect_json_parts':
    'If OUTPUT_LIMIT_REACHED, collects Part 1…N into one complete JSON and downloads it.',
  'flow.repeat_if_more': 'If more library titles remain, jump back and run again.',
  'flow.goto_step': 'Jump to another step you choose from a list.',
  'flow.next_plan_execute':
    'Start another Plan in this Workflow. Pick the target from the dropdown - list order is ignored.',
  'element.wait_visible': 'Wait until a picked element/icon appears.',
  'element.if_visible': 'If element visible → true path; otherwise → false path.',
  'conditions.if':
    'If/else on button, text, element, or variable - with mouse pick and wait.',
  'conditions.switch':
    'Multi-way branch on variable or picked element text - cases + default.',
  'element.wait_hidden': 'Wait until a picked element disappears.',
  'element.wait_text': 'Wait until text appears somewhere on the page.',
  'element.wait_button': 'Wait until a button is ready (by label or pick).',
  'flow.start': 'Starting point of the workflow.',
  'flow.end': 'Finishes the workflow.',
  'flow.connector':
    'Visual connector only - rename the title; edges pass through with no side effects.',
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
