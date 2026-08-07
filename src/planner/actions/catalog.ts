import type { ActionCategory, ActionDefinition, ActionField } from '@/planner/actions/types'

const selectorField: ActionField = {
  key: 'selector',
  label: 'Selector',
  type: 'selector',
  required: true,
  placeholder: 'CSS / ARIA / text selector',
  help: 'Use Selector Lab to pick from the page',
}

function def(
  partial: Omit<ActionDefinition, 'color' | 'fields'> & {
    color?: string
    fields?: ActionField[]
  },
): ActionDefinition {
  return {
    color: partial.color ?? categoryColor(partial.category),
    fields: partial.fields ?? [],
    ...partial,
  }
}

function categoryColor(category: ActionCategory): string {
  const map: Record<ActionCategory, string> = {
    browser: '#0f766e',
    mouse: '#2563eb',
    keyboard: '#7c3aed',
    input: '#0891b2',
    element: '#059669',
    clipboard: '#ca8a04',
    storage: '#d97706',
    variables: '#4f46e5',
    conditions: '#db2777',
    loops: '#ea580c',
    data: '#0d9488',
    downloads: '#0284c7',
    upload: '#65a30d',
    ai: '#16a34a',
    wait: '#64748b',
    screenshot: '#9333ea',
    logging: '#475569',
    flow: '#334155',
    error: '#dc2626',
  }
  return map[category]
}

const browserActions: ActionDefinition[] = [
  def({
    id: 'browser.open_url',
    name: 'Open URL',
    category: 'browser',
    description: 'Open a website in a new or existing tab',
    icon: 'Globe',
    fields: [
      { key: 'url', label: 'URL', type: 'url', required: true, defaultValue: 'https://chatgpt.com/' },
      { key: 'active', label: 'Focus tab', type: 'boolean', defaultValue: true },
      {
        key: 'reuseExisting',
        label: 'Reuse existing tab',
        type: 'boolean',
        defaultValue: true,
        help: 'If a tab with this site is already open, focus it instead of opening another',
      },
    ],
  }),
  def({
    id: 'browser.refresh',
    name: 'Refresh Page',
    category: 'browser',
    description: 'Reload the active tab',
    icon: 'RefreshCw',
  }),
  def({
    id: 'browser.reload',
    name: 'Reload',
    category: 'browser',
    description: 'Hard reload the page',
    icon: 'RotateCw',
  }),
  def({
    id: 'browser.go_back',
    name: 'Go Back',
    category: 'browser',
    description: 'Navigate back in history',
    icon: 'ArrowLeft',
  }),
  def({
    id: 'browser.go_forward',
    name: 'Go Forward',
    category: 'browser',
    description: 'Navigate forward in history',
    icon: 'ArrowRight',
  }),
  def({
    id: 'browser.close_tab',
    name: 'Close Tab',
    category: 'browser',
    description: 'Close the active or specified tab',
    icon: 'X',
  }),
  def({
    id: 'browser.new_tab',
    name: 'Open New Tab',
    category: 'browser',
    description: 'Open a blank or URL tab',
    icon: 'PlusSquare',
    fields: [{ key: 'url', label: 'URL', type: 'url', defaultValue: 'chrome://newtab' }],
  }),
  def({
    id: 'browser.switch_tab',
    name: 'Switch Tab',
    category: 'browser',
    description: 'Activate a tab by id or URL match',
    icon: 'PanelsTopLeft',
    fields: [
      { key: 'tabId', label: 'Tab ID', type: 'number' },
      { key: 'urlIncludes', label: 'URL contains', type: 'string' },
    ],
  }),
  def({
    id: 'browser.focus_tab',
    name: 'Focus Tab',
    category: 'browser',
    description: 'Focus the active automation tab',
    icon: 'Focus',
  }),
  def({
    id: 'browser.wait_for_page',
    name: 'Wait For Page',
    category: 'browser',
    description: 'Wait until document is complete',
    icon: 'Hourglass',
  }),
  def({
    id: 'browser.scroll',
    name: 'Scroll',
    category: 'browser',
    description: 'Scroll the page by pixels',
    icon: 'Mouse',
    fields: [{ key: 'y', label: 'Scroll Y', type: 'number', defaultValue: 600 }],
  }),
  def({
    id: 'browser.scroll_to',
    name: 'Scroll To',
    category: 'browser',
    description: 'Scroll an element into view',
    icon: 'Scan',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'browser.download_file',
    name: 'Download File',
    category: 'browser',
    description: 'Download a file from URL',
    icon: 'Download',
    fields: [
      { key: 'url', label: 'File URL', type: 'url', required: true },
      { key: 'filename', label: 'Filename', type: 'string' },
    ],
  }),
  def({
    id: 'browser.handle_dialog',
    name: 'Handle Dialog',
    category: 'browser',
    description: 'Accept or dismiss alert/confirm dialogs',
    icon: 'MessageSquareWarning',
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        defaultValue: 'accept',
        options: [
          { label: 'Accept', value: 'accept' },
          { label: 'Dismiss', value: 'dismiss' },
        ],
      },
    ],
  }),
]

const mouseActions: ActionDefinition[] = [
  def({
    id: 'mouse.click',
    name: 'Click',
    category: 'mouse',
    description: 'Click an element',
    icon: 'MousePointerClick',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'mouse.double_click',
    name: 'Double Click',
    category: 'mouse',
    description: 'Double click an element',
    icon: 'MousePointer2',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'mouse.right_click',
    name: 'Right Click',
    category: 'mouse',
    description: 'Open context menu on element',
    icon: 'Click',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'mouse.hover',
    name: 'Hover',
    category: 'mouse',
    description: 'Hover over an element',
    icon: 'Hand',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'mouse.drag_drop',
    name: 'Drag & Drop',
    category: 'mouse',
    description: 'Drag source onto target',
    icon: 'Move',
    fields: [
      { key: 'sourceSelector', label: 'Source', type: 'selector', required: true },
      { key: 'targetSelector', label: 'Target', type: 'selector', required: true },
    ],
  }),
  def({
    id: 'mouse.click_coordinates',
    name: 'Click Coordinates',
    category: 'mouse',
    description: 'Click at x/y coordinates',
    icon: 'Crosshair',
    fields: [
      { key: 'x', label: 'X', type: 'number', required: true },
      { key: 'y', label: 'Y', type: 'number', required: true },
    ],
  }),
]

const keyboardActions: ActionDefinition[] = [
  def({
    id: 'keyboard.type_text',
    name: 'Type Text',
    category: 'keyboard',
    description:
      'Type into the focused chat box (or a picked selector) from manual text / Text library',
    tooltip: 'Types text character by character (manual or Story Title library + prompt template).',
    icon: 'Keyboard',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        required: false,
        help: 'Optional — after New chat click, leave empty to type where the cursor blinks',
      },
      {
        key: 'textMode',
        label: 'Text source',
        type: 'select',
        defaultValue: 'library',
        options: [
          { label: 'Manual text', value: 'manual' },
          { label: 'Text library', value: 'library' },
        ],
        help: 'Libraries are managed in Planner → Text libraries',
      },
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        required: false,
        placeholder: 'Text to type when source is Manual',
      },
      {
        key: 'textLibraryId',
        label: 'Library',
        type: 'string',
        placeholder: 'story title library id',
      },
      {
        key: 'textItemIds',
        label: 'Selected titles',
        type: 'string',
        defaultValue: 'all',
      },
      {
        key: 'textTemplate',
        label: 'Prompt template',
        type: 'textarea',
        required: false,
        help: 'Use {_Story Title} to insert the next library title',
      },
      {
        key: 'queueWrap',
        label: 'Wrap queue forever',
        type: 'boolean',
        defaultValue: false,
        help: 'Keep off for batch loops with Repeat If More Titles',
      },
      {
        key: 'typingSpeed',
        label: 'Typing speed',
        type: 'select',
        defaultValue: 'human',
        options: [
          { label: 'Human-like', value: 'human' },
          { label: 'Slow (careful)', value: 'slow' },
          { label: 'Instant', value: 'instant' },
        ],
      },
    ],
  }),
  def({
    id: 'keyboard.paste_text',
    name: 'Paste Text',
    category: 'keyboard',
    description:
      'Same as Type Text (manual / library / {_template}), but pastes the full text instantly — no typing',
    tooltip:
      'Pastes the full prompt at once. Same libraries & {_Story Title} templates as Type Text.',
    icon: 'ClipboardPaste',
    supportsSelector: true,
    favoriteDefault: true,
    fields: [
      {
        ...selectorField,
        required: false,
        defaultValue:
          '#prompt-textarea, [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"]',
        help: 'ChatGPT Ask-anything box. Use Pick with mouse if paste still fails.',
      },
      {
        key: 'textMode',
        label: 'Text source',
        type: 'select',
        defaultValue: 'library',
        options: [
          { label: 'Manual text', value: 'manual' },
          { label: 'Text library', value: 'library' },
        ],
        help: 'Libraries are managed in Planner → Text libraries',
      },
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        required: false,
        placeholder: 'Text to paste when source is Manual',
      },
      {
        key: 'textLibraryId',
        label: 'Library',
        type: 'string',
        placeholder: 'story title library id',
      },
      {
        key: 'textItemIds',
        label: 'Selected titles',
        type: 'string',
        defaultValue: 'all',
      },
      {
        key: 'textTemplate',
        label: 'Prompt template',
        type: 'textarea',
        required: false,
        help: 'Use {_Story Title} to insert the next library title',
      },
      {
        key: 'queueWrap',
        label: 'Wrap queue forever',
        type: 'boolean',
        defaultValue: false,
        help: 'Keep off for batch loops with Repeat If More Titles',
      },
    ],
  }),
  def({
    id: 'keyboard.press_key',
    name: 'Press Key',
    category: 'keyboard',
    description: 'Press a single key',
    icon: 'Command',
    fields: [
      { key: 'key', label: 'Key', type: 'key', required: true, defaultValue: 'Enter' },
      { ...selectorField, required: false },
    ],
  }),
  def({
    id: 'keyboard.shortcut',
    name: 'Shortcut Keys',
    category: 'keyboard',
    description: 'Press a key combination',
    icon: 'CornerDownLeft',
    fields: [
      {
        key: 'shortcut',
        label: 'Shortcut',
        type: 'string',
        required: true,
        placeholder: 'Control+A',
        defaultValue: 'Control+Enter',
      },
    ],
  }),
  def({
    id: 'keyboard.paste',
    name: 'Paste',
    category: 'keyboard',
    description: 'Paste clipboard into element',
    icon: 'ClipboardPaste',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'keyboard.select_all',
    name: 'Select All',
    category: 'keyboard',
    description: 'Select all text in element',
    icon: 'TextSelect',
    supportsSelector: true,
    fields: [{ ...selectorField, required: false }],
  }),
]

const inputActions: ActionDefinition[] = [
  def({
    id: 'input.fill',
    name: 'Input Text',
    category: 'input',
    description: 'Fill an input field',
    icon: 'FormInput',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'value', label: 'Value', type: 'textarea', required: true },
    ],
  }),
  def({
    id: 'input.clear',
    name: 'Clear Input',
    category: 'input',
    description: 'Clear an input value',
    icon: 'Eraser',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'input.append',
    name: 'Append Text',
    category: 'input',
    description: 'Append text to an input',
    icon: 'TextCursorInput',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'value', label: 'Value', type: 'string', required: true },
    ],
  }),
  def({
    id: 'input.checkbox',
    name: 'Checkbox',
    category: 'input',
    description: 'Check or uncheck a checkbox',
    icon: 'CheckSquare',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'checked', label: 'Checked', type: 'boolean', defaultValue: true },
    ],
  }),
  def({
    id: 'input.dropdown',
    name: 'Dropdown',
    category: 'input',
    description: 'Select a dropdown option',
    icon: 'List',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'value', label: 'Option value', type: 'string', required: true },
    ],
  }),
]

const matchModeField: ActionField = {
  key: 'matchMode',
  label: 'Match mode',
  type: 'select',
  defaultValue: 'contains',
  options: [
    { label: 'Contains', value: 'contains' },
    { label: 'Exact line / phrase', value: 'exact' },
    { label: 'Regex', value: 'regex' },
  ],
}

const elementActions: ActionDefinition[] = [
  def({
    id: 'element.wait_visible',
    name: 'Wait Until Visible',
    category: 'element',
    description: 'Wait until picked element/icon is visible on screen',
    icon: 'Eye',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        help: 'Pick with mouse — waits until that element is actually visible',
      },
    ],
  }),
  def({
    id: 'element.if_visible',
    name: 'If Element Visible',
    category: 'element',
    description: 'If picked button/element is visible → true path, otherwise → false path',
    icon: 'GitBranch',
    supportsSelector: true,
    controlFlow: true,
    fields: [
      {
        ...selectorField,
        help: 'Pick the button to check. Connect green true → click it; red false → other click',
      },
      {
        key: 'pollMs',
        label: 'Check window (ms)',
        type: 'number',
        defaultValue: 2500,
        help: 'How long to look for the element before taking the false path',
      },
    ],
  }),
  def({
    id: 'element.wait_hidden',
    name: 'Wait Until Hidden',
    category: 'element',
    description: 'Wait until element is removed or no longer visible',
    icon: 'EyeOff',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'element.wait_clickable',
    name: 'Wait Until Clickable',
    category: 'element',
    description: 'Wait until element is visible and enabled/clickable',
    icon: 'MousePointerClick',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'element.wait_text',
    name: 'Wait For Text',
    category: 'element',
    description: 'Wait until text appears anywhere in the page/window',
    icon: 'TextCursorInput',
    fields: [
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        required: true,
        placeholder: 'Exact or partial text to find on the page',
      },
      matchModeField,
    ],
  }),
  def({
    id: 'element.wait_exact_text',
    name: 'Wait For Exact Text',
    category: 'element',
    description: 'Wait until an exact text line/phrase appears in the window',
    icon: 'TextSelect',
    fields: [
      {
        key: 'text',
        label: 'Exact text',
        type: 'textarea',
        required: true,
        placeholder: 'Sleeping on Mars',
        help: 'Matches a full line or the whole page text exactly',
      },
    ],
  }),
  def({
    id: 'element.wait_text_gone',
    name: 'Wait Until Text Gone',
    category: 'element',
    description: 'Wait until text disappears from the page',
    icon: 'Eraser',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', required: true },
      matchModeField,
    ],
  }),
  def({
    id: 'element.wait_button',
    name: 'Wait For Button',
    category: 'element',
    description: 'Wait until a button appears (by label text or picked selector)',
    icon: 'RectangleHorizontal',
    supportsSelector: true,
    fields: [
      {
        key: 'buttonText',
        label: 'Button label',
        type: 'string',
        placeholder: 'Send / New chat / Continue',
        help: 'Optional if you pick a selector with mouse',
      },
      {
        key: 'exact',
        label: 'Exact label match',
        type: 'boolean',
        defaultValue: false,
      },
      {
        ...selectorField,
        required: false,
        help: 'Optional — pick the button with mouse instead of label',
      },
    ],
  }),
  def({
    id: 'element.wait_icon',
    name: 'Wait For Icon / Image',
    category: 'element',
    description: 'Wait until an icon/image/SVG (picked selector) is visible',
    icon: 'Scan',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        help: 'Pick the icon/image with mouse',
      },
    ],
  }),
  def({
    id: 'element.find',
    name: 'Find Element',
    category: 'element',
    description: 'Assert an element exists',
    icon: 'Search',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'element.extract_text',
    name: 'Extract Text',
    category: 'element',
    description: 'Read text content from element',
    icon: 'FileText',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'outputKey', label: 'Save as variable', type: 'string', defaultValue: 'extractedText' },
    ],
  }),
  def({
    id: 'element.extract_attribute',
    name: 'Extract Attribute',
    category: 'element',
    description: 'Read an attribute value',
    icon: 'Tags',
    supportsSelector: true,
    fields: [
      selectorField,
      { key: 'attribute', label: 'Attribute', type: 'string', required: true, defaultValue: 'href' },
      { key: 'outputKey', label: 'Save as variable', type: 'string', defaultValue: 'extractedAttr' },
    ],
  }),
  def({
    id: 'element.highlight',
    name: 'Highlight Element',
    category: 'element',
    description: 'Temporarily highlight a matched element',
    icon: 'Highlighter',
    supportsSelector: true,
    fields: [selectorField],
  }),
]

const variableActions: ActionDefinition[] = [
  def({
    id: 'variables.set',
    name: 'Create / Update Variable',
    category: 'variables',
    description: 'Set a workflow variable',
    icon: 'Variable',
    fields: [
      { key: 'key', label: 'Name', type: 'string', required: true },
      { key: 'value', label: 'Value', type: 'textarea', required: true },
    ],
  }),
  def({
    id: 'variables.delete',
    name: 'Delete Variable',
    category: 'variables',
    description: 'Remove a variable',
    icon: 'Trash2',
    fields: [{ key: 'key', label: 'Name', type: 'string', required: true }],
  }),
  def({
    id: 'variables.append',
    name: 'Append to Variable',
    category: 'variables',
    description: 'Append text onto an existing variable (for collecting parts)',
    icon: 'PlusSquare',
    fields: [
      { key: 'key', label: 'Variable name', type: 'string', required: true, defaultValue: 'finalStoryJson' },
      { key: 'text', label: 'Text / {{var}} to append', type: 'textarea', required: true },
      {
        key: 'separator',
        label: 'Separator',
        type: 'string',
        defaultValue: '',
        help: 'Leave empty to join with zero changes (required for JSON parts)',
      },
    ],
  }),
]

const conditionActions: ActionDefinition[] = [
  def({
    id: 'conditions.if',
    name: 'If',
    category: 'conditions',
    description:
      'If/else branch: element visible, button name, page text, or variable — with wait + mouse pick',
    icon: 'GitBranch',
    controlFlow: true,
    supportsSelector: true,
    fields: [
      {
        key: 'checkType',
        label: 'Check what',
        type: 'select',
        defaultValue: 'element_visible',
        options: [
          { label: 'Element visible', value: 'element_visible' },
          { label: 'Element exists', value: 'element_exists' },
          { label: 'Element clickable', value: 'element_clickable' },
          { label: 'Button by name', value: 'button_name' },
          { label: 'Text on page', value: 'text_present' },
          { label: 'Text gone', value: 'text_gone' },
          { label: 'Variable', value: 'variable' },
        ],
      },
      { key: 'waitBeforeMs', label: 'Wait before (ms)', type: 'number', defaultValue: 0 },
      { key: 'waitMs', label: 'Check window (ms)', type: 'number', defaultValue: 2500 },
      { ...selectorField, required: false },
      { key: 'buttonName', label: 'Button name', type: 'string', placeholder: 'Continue' },
      { key: 'text', label: 'Text', type: 'string' },
      { key: 'left', label: 'Left value', type: 'string', placeholder: '{{variable}}' },
      { key: 'operator', label: 'Operator', type: 'string', defaultValue: 'equals' },
      { key: 'right', label: 'Right value', type: 'string' },
      { key: 'negate', label: 'Invert', type: 'boolean', defaultValue: false },
    ],
  }),
  def({
    id: 'conditions.switch',
    name: 'Switch',
    category: 'conditions',
    description:
      'Multi-way branch on a variable, picked element text, or attribute — with wait + cases + default',
    icon: 'Split',
    controlFlow: true,
    supportsSelector: true,
    fields: [
      {
        key: 'sourceType',
        label: 'Value from',
        type: 'select',
        defaultValue: 'variable',
        options: [
          { label: 'Variable', value: 'variable' },
          { label: 'Element text', value: 'element_text' },
          { label: 'Element attribute', value: 'element_attribute' },
        ],
      },
      { key: 'waitBeforeMs', label: 'Wait before (ms)', type: 'number', defaultValue: 0 },
      { key: 'waitMs', label: 'Check window (ms)', type: 'number', defaultValue: 2500 },
      { key: 'value', label: 'Value', type: 'string', placeholder: '{{status}}' },
      { ...selectorField, required: false },
      { key: 'attribute', label: 'Attribute', type: 'string', defaultValue: 'href' },
      {
        key: 'cases',
        label: 'Cases (comma separated)',
        type: 'string',
        placeholder: 'Continue,Retry,Cancel',
        help: 'Each case is a branch; unmatched uses default',
      },
      {
        key: 'matchMode',
        label: 'Match mode',
        type: 'select',
        defaultValue: 'equals',
        options: [
          { label: 'Equals', value: 'equals' },
          { label: 'Contains', value: 'contains' },
          { label: 'Starts with', value: 'starts_with' },
          { label: 'Regex', value: 'regex' },
        ],
      },
    ],
  }),
]

const loopActions: ActionDefinition[] = [
  def({
    id: 'loops.for',
    name: 'For',
    category: 'loops',
    description: 'Repeat N times',
    icon: 'Repeat',
    controlFlow: true,
    fields: [
      { key: 'count', label: 'Count', type: 'number', required: true, defaultValue: 3 },
      { key: 'indexVariable', label: 'Index variable', type: 'string', defaultValue: 'i' },
    ],
  }),
  def({
    id: 'loops.while',
    name: 'While',
    category: 'loops',
    description: 'Loop while condition holds',
    icon: 'RefreshCcw',
    controlFlow: true,
    fields: [
      { key: 'left', label: 'Left', type: 'string', required: true },
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        defaultValue: 'not_empty',
        options: [
          { label: 'Equals', value: 'equals' },
          { label: 'Not Empty', value: 'not_empty' },
          { label: 'Less Than', value: 'lt' },
        ],
      },
      { key: 'right', label: 'Right', type: 'string' },
      { key: 'maxIterations', label: 'Max iterations', type: 'number', defaultValue: 50 },
    ],
  }),
  def({
    id: 'loops.foreach',
    name: 'ForEach',
    category: 'loops',
    description: 'Loop over an array variable',
    icon: 'ListTree',
    controlFlow: true,
    fields: [
      { key: 'collectionKey', label: 'Collection variable', type: 'string', required: true },
      { key: 'itemVariable', label: 'Item variable', type: 'string', defaultValue: 'item' },
    ],
  }),
  def({
    id: 'loops.break',
    name: 'Break',
    category: 'loops',
    description: 'Break out of the current loop',
    icon: 'CircleStop',
    controlFlow: true,
  }),
  def({
    id: 'loops.continue',
    name: 'Continue',
    category: 'loops',
    description: 'Continue to next loop iteration',
    icon: 'SkipForward',
    controlFlow: true,
  }),
]

const waitActions: ActionDefinition[] = [
  def({
    id: 'wait.delay',
    name: 'Fixed Delay',
    category: 'wait',
    description: 'Wait a fixed number of milliseconds',
    icon: 'Timer',
    fields: [{ key: 'ms', label: 'Milliseconds', type: 'number', defaultValue: 1000, required: true }],
  }),
  def({
    id: 'wait.random',
    name: 'Random Delay',
    category: 'wait',
    description: 'Wait a random duration',
    icon: 'Dices',
    fields: [
      { key: 'minMs', label: 'Min ms', type: 'number', defaultValue: 500 },
      { key: 'maxMs', label: 'Max ms', type: 'number', defaultValue: 1500 },
    ],
  }),
  def({
    id: 'wait.until_url',
    name: 'Wait Until URL',
    category: 'wait',
    description: 'Wait until URL contains text',
    icon: 'Link',
    fields: [{ key: 'includes', label: 'URL contains', type: 'string', required: true }],
  }),
  def({
    id: 'wait.until_element',
    name: 'Wait Until Element',
    category: 'wait',
    description: 'Wait until picked element is visible',
    icon: 'Clock',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'wait.until_hidden',
    name: 'Wait Until Hidden',
    category: 'wait',
    description: 'Wait until picked element is hidden/removed',
    icon: 'EyeOff',
    supportsSelector: true,
    fields: [selectorField],
  }),
  def({
    id: 'wait.until_text',
    name: 'Wait Until Text',
    category: 'wait',
    description: 'Wait for text anywhere in the window',
    icon: 'TextCursorInput',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', required: true },
      matchModeField,
    ],
  }),
  def({
    id: 'wait.until_button',
    name: 'Wait Until Button',
    category: 'wait',
    description: 'Wait for a button by label or selector',
    icon: 'MousePointerClick',
    supportsSelector: true,
    fields: [
      { key: 'buttonText', label: 'Button label', type: 'string', placeholder: 'Send' },
      { key: 'exact', label: 'Exact label match', type: 'boolean', defaultValue: false },
      { ...selectorField, required: false },
    ],
  }),
  def({
    id: 'wait.until_clickable',
    name: 'Wait Until Clickable',
    category: 'wait',
    description: 'Wait until element can be clicked',
    icon: 'Hand',
    supportsSelector: true,
    fields: [selectorField],
  }),
]

const aiActions: ActionDefinition[] = [
  def({
    id: 'ai.open_chatgpt',
    name: 'Open ChatGPT',
    category: 'ai',
    description: 'Open ChatGPT — reuses tab if already open',
    icon: 'Bot',
    fields: [
      { key: 'url', label: 'URL', type: 'url', defaultValue: 'https://chatgpt.com/' },
      {
        key: 'reuseExisting',
        label: 'Reuse existing tab',
        type: 'boolean',
        defaultValue: true,
      },
    ],
  }),
  def({
    id: 'ai.open_claude',
    name: 'Open Claude',
    category: 'ai',
    description: 'Open Claude web app',
    icon: 'Sparkles',
    fields: [{ key: 'url', label: 'URL', type: 'url', defaultValue: 'https://claude.ai' }],
  }),
  def({
    id: 'ai.open_gemini',
    name: 'Open Gemini',
    category: 'ai',
    description: 'Open Gemini web app',
    icon: 'Stars',
    fields: [{ key: 'url', label: 'URL', type: 'url', defaultValue: 'https://gemini.google.com' }],
  }),
  def({
    id: 'ai.open_grok',
    name: 'Open Grok',
    category: 'ai',
    description: 'Open Grok web app',
    icon: 'Zap',
    fields: [{ key: 'url', label: 'URL', type: 'url', defaultValue: 'https://grok.com' }],
  }),
  def({
    id: 'ai.paste_prompt',
    name: 'Paste Prompt',
    category: 'ai',
    description: 'Paste prompt into AI composer',
    icon: 'MessageSquarePlus',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        defaultValue: '#prompt-textarea, div[contenteditable="true"]',
      },
      { key: 'prompt', label: 'Prompt', type: 'textarea', required: true },
    ],
  }),
  def({
    id: 'ai.click_send',
    name: 'Click Send',
    category: 'ai',
    description: 'Click AI send button',
    icon: 'Send',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        defaultValue: 'button[data-testid="send-button"], button[aria-label*="Send"]',
      },
    ],
  }),
  def({
    id: 'ai.wait_response',
    name: 'Wait Response',
    category: 'ai',
    description: 'Wait until ChatGPT finishes generating (Stop button gone)',
    icon: 'MessagesSquare',
    fields: [],
  }),
  def({
    id: 'ai.copy_response',
    name: 'Copy Response',
    category: 'ai',
    description: 'Extract AI response text into a variable',
    icon: 'Copy',
    supportsSelector: true,
    fields: [
      {
        ...selectorField,
        defaultValue: '[data-message-author-role="assistant"]:last-of-type',
      },
      { key: 'outputKey', label: 'Save as', type: 'string', defaultValue: 'aiResponse' },
    ],
  }),
  def({
    id: 'ai.collect_json_parts',
    name: 'Collect JSON Parts',
    category: 'ai',
    description:
      'If ChatGPT returns OUTPUT_LIMIT_REACHED / success:false, ask part count, collect Part 1…N, join into complete JSON, and download',
    tooltip:
      'Handles long JSON stories: asks how many parts, collects each part, concatenates with zero edits, saves a .json file.',
    icon: 'ListTree',
    favoriteDefault: true,
    fields: [
      {
        key: 'maxParts',
        label: 'Max parts',
        type: 'number',
        defaultValue: 12,
        help: 'Safety cap (2–20)',
      },
      {
        key: 'filename',
        label: 'Download filename',
        type: 'string',
        defaultValue: 'chatgpt-story.json',
        help: 'Saved via Chrome downloads',
      },
      {
        key: 'autoDownload',
        label: 'Auto-download joined JSON',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'outputKey',
        label: 'Save JSON variable as',
        type: 'string',
        defaultValue: 'finalStoryJson',
      },
    ],
  }),
  def({
    id: 'ai.chatgpt_prompt',
    name: 'ChatGPT Prompt (module)',
    category: 'ai',
    description: 'Full ChatGPT module: open, type, send, extract',
    icon: 'BotMessageSquare',
    fields: [{ key: 'prompt', label: 'Prompt', type: 'textarea', required: true }],
  }),
]

const flowActions: ActionDefinition[] = [
  def({
    id: 'flow.start',
    name: 'Start',
    category: 'flow',
    description: 'Workflow entry point',
    icon: 'Play',
    controlFlow: true,
  }),
  def({
    id: 'flow.end',
    name: 'End',
    category: 'flow',
    description: 'End workflow',
    icon: 'Flag',
    controlFlow: true,
  }),
  def({
    id: 'flow.stop',
    name: 'Stop',
    category: 'flow',
    description: 'Stop execution immediately',
    icon: 'Square',
    controlFlow: true,
  }),
  def({
    id: 'flow.pause',
    name: 'Pause',
    category: 'flow',
    description: 'Pause and wait for resume',
    icon: 'Pause',
    controlFlow: true,
  }),
  def({
    id: 'flow.goto_step',
    name: 'Jump To Step',
    category: 'flow',
    description: 'Jump to another step you pick from a list',
    tooltip: 'Jump to another step you choose from a dropdown — no ID typing needed.',
    icon: 'CornerUpRight',
    controlFlow: true,
    fields: [
      {
        key: 'targetNodeId',
        label: 'Jump to step',
        type: 'nodeRef',
        required: true,
        help: 'Pick the canvas step to jump to',
      },
    ],
  }),
  def({
    id: 'flow.repeat_if_more',
    name: 'Repeat If More Titles',
    category: 'flow',
    description:
      'After TypeText from a library: if more titles remain, jump back (e.g. to New chat)',
    tooltip:
      'If more Story Titles remain, go back to New chat and type the next one. Pick the step from the dropdown.',
    icon: 'RefreshCw',
    controlFlow: true,
    fields: [
      {
        key: 'targetNodeId',
        label: 'Jump back to step',
        type: 'nodeRef',
        required: true,
        help: 'Usually choose “Click · New chat” — no need to type n_new_chat',
      },
    ],
  }),
  def({
    id: 'flow.goto_workflow',
    name: 'Go To Workflow',
    category: 'flow',
    description: 'Run a nested / sub workflow',
    icon: 'Workflow',
    controlFlow: true,
    fields: [{ key: 'workflowId', label: 'Workflow ID', type: 'string', required: true }],
  }),
  def({
    id: 'flow.return',
    name: 'Return',
    category: 'flow',
    description: 'Return from nested workflow',
    icon: 'Undo2',
    controlFlow: true,
  }),
]

const loggingActions: ActionDefinition[] = [
  def({
    id: 'logging.info',
    name: 'Log Info',
    category: 'logging',
    description: 'Write info log',
    icon: 'Info',
    fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true }],
  }),
  def({
    id: 'logging.error',
    name: 'Log Error',
    category: 'logging',
    description: 'Write error log',
    icon: 'AlertTriangle',
    fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true }],
  }),
  def({
    id: 'logging.success',
    name: 'Log Success',
    category: 'logging',
    description: 'Write success log',
    icon: 'CheckCircle2',
    fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true }],
  }),
]

const dataActions: ActionDefinition[] = [
  def({
    id: 'data.json_parse',
    name: 'JSON Parse',
    category: 'data',
    description: 'Parse JSON string into variable',
    icon: 'Braces',
    fields: [
      { key: 'source', label: 'JSON text / {{var}}', type: 'textarea', required: true },
      { key: 'outputKey', label: 'Output variable', type: 'string', defaultValue: 'parsed' },
    ],
  }),
  def({
    id: 'data.regex_extract',
    name: 'Regex Extract',
    category: 'data',
    description: 'Extract a capture group from text into a variable (e.g. part count)',
    icon: 'Search',
    fields: [
      { key: 'source', label: 'Source / {{var}}', type: 'textarea', required: true },
      {
        key: 'pattern',
        label: 'Regex pattern',
        type: 'string',
        required: true,
        defaultValue: '"partCount"\\s*:\\s*(\\d+)',
      },
      { key: 'group', label: 'Capture group', type: 'number', defaultValue: 1 },
      { key: 'outputKey', label: 'Output variable', type: 'string', defaultValue: 'partCount' },
    ],
  }),
  def({
    id: 'data.replace',
    name: 'Replace',
    category: 'data',
    description: 'Replace text in a variable',
    icon: 'Replace',
    fields: [
      { key: 'source', label: 'Source', type: 'string', required: true },
      { key: 'search', label: 'Search', type: 'string', required: true },
      { key: 'replaceWith', label: 'Replace with', type: 'string', defaultValue: '' },
      { key: 'outputKey', label: 'Output variable', type: 'string', defaultValue: 'replaced' },
    ],
  }),
  def({
    id: 'data.trim',
    name: 'Trim',
    category: 'data',
    description: 'Trim whitespace',
    icon: 'AlignLeft',
    fields: [
      { key: 'source', label: 'Source', type: 'string', required: true },
      { key: 'outputKey', label: 'Output variable', type: 'string', defaultValue: 'trimmed' },
    ],
  }),
]

const downloadActions: ActionDefinition[] = [
  def({
    id: 'downloads.download_url',
    name: 'Download Image/File',
    category: 'downloads',
    description: 'Download from URL into project folder',
    icon: 'DownloadCloud',
    fields: [
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'filename', label: 'Filename', type: 'string' },
      { key: 'projectName', label: 'Project', type: 'string', defaultValue: 'default' },
    ],
  }),
  def({
    id: 'downloads.save_text',
    name: 'Save Text File',
    category: 'downloads',
    description: 'Download a text/JSON variable as a file',
    icon: 'Download',
    fields: [
      {
        key: 'text',
        label: 'Text / {{variable}}',
        type: 'textarea',
        required: true,
        placeholder: '{{finalStoryJson}}',
      },
      {
        key: 'filename',
        label: 'Filename',
        type: 'string',
        defaultValue: 'output.json',
      },
    ],
  }),
]

const clipboardActions: ActionDefinition[] = [
  def({
    id: 'clipboard.copy_event',
    name: 'Copy Event',
    category: 'clipboard',
    description:
      'One-step Copy Event: pick the page Copy button, click it, capture text, save to workflow Copy Store (story-{_NumberAuto}), and optionally format as JSON.',
    tooltip: 'Pick Copy button → click → save as story-1, story-2… · use {{COPY:story-1}} later',
    howto: [
      'Drag Copy Event onto the canvas.',
      'Use “Pick Copy button” and click the real Copy button on the page (ChatGPT Copy, etc.).',
      'Source mode “Click Copy button” (default): workflow clicks that button, reads the clipboard, then saves.',
      'Set Copy name to story-{_NumberAuto} (or short-story-{_NumberAuto}).',
      'Format text or JSON. Store stays on by default.',
      'Later steps: {{COPY:story-1}} / {{COPY_NAME:story-1}} / {{COPY:story-1.number}}.',
    ],
    icon: 'Copy',
    favoriteDefault: true,
    supportsSelector: true,
    fields: [
      {
        key: 'sourceMode',
        label: 'Source mode',
        type: 'select',
        defaultValue: 'click_copy_button',
        options: [
          {
            label: 'Click Copy button → read clipboard',
            value: 'click_copy_button',
          },
          {
            label: 'Extract text from picked element',
            value: 'extract_from_element',
          },
          {
            label: 'Manual / {{variable}} text',
            value: 'manual_or_variable',
          },
        ],
        help: 'Default: pick the page Copy button; runtime clicks it and captures clipboard text',
      },
      {
        ...selectorField,
        key: 'selector',
        label: 'Copy button / element selector',
        required: false,
        placeholder: 'Pick the Copy button with mouse',
        help: 'Use Pick Copy button — required for click/extract modes',
      },
      {
        key: 'text',
        label: 'Text (manual / variable mode)',
        type: 'textarea',
        required: false,
        placeholder: '{{aiResponse}}',
        help: 'Only used when Source mode = Manual / {{variable}}',
      },
      {
        key: 'clickDelayMs',
        label: 'Wait after click (ms)',
        type: 'number',
        defaultValue: 250,
        help: 'Delay before reading clipboard after clicking Copy',
      },
      {
        key: 'copy',
        label: 'Keep / write clipboard',
        type: 'boolean',
        defaultValue: true,
        help: 'After save, ensure clipboard has the formatted payload',
      },
      {
        key: 'store',
        label: 'Store in Copy Store',
        type: 'boolean',
        defaultValue: true,
        help: 'Save into this workflow’s Copy Store (recommended ON)',
      },
      {
        key: 'name',
        label: 'Copy name',
        type: 'string',
        defaultValue: 'story-{_NumberAuto}',
        placeholder: 'story-{_NumberAuto}',
        help: 'Supports {_NumberAuto}. Prefixes are independent (story vs short-story).',
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        defaultValue: 'text',
        options: [
          { label: 'Plain text', value: 'text' },
          { label: 'JSON', value: 'json' },
        ],
      },
      {
        key: 'outputKey',
        label: 'Also save as variable',
        type: 'string',
        defaultValue: 'copiedText',
        help: 'Optional run variable for the captured plain text',
      },
    ],
  }),
  def({
    id: 'clipboard.write',
    name: 'Write Clipboard',
    category: 'clipboard',
    description:
      'Copy text to the browser clipboard. Optionally save into the workflow Copy Store with dynamic names like story-{_NumberAuto}.',
    tooltip: 'Copy text + optional workflow-scoped Copy Store ({{COPY:story-1}})',
    howto: [
      'Set Text to the content you want copied (supports {{variables}} and {{COPY:name}}).',
      'Enable Store in Copy Store to keep the result for later steps in this workflow.',
      'Use Name like story-{_NumberAuto} for story-1, story-2, … (per-prefix series).',
      'Format JSON copies {"name","text"} while still storing the plain text.',
      'Reference later with {{COPY:story-1}}, {{COPY_NAME:story-1}}, or {{COPY:story-1.number}}.',
    ],
    icon: 'Clipboard',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', required: true },
      {
        key: 'copy',
        label: 'Copy to clipboard',
        type: 'boolean',
        defaultValue: true,
        help: 'Write to the OS/browser clipboard via Clipboard API',
      },
      {
        key: 'store',
        label: 'Store in Copy Store',
        type: 'boolean',
        defaultValue: false,
        help: 'Save into this workflow’s Copy Store for later {{COPY:…}} access',
      },
      {
        key: 'name',
        label: 'Copy name',
        type: 'string',
        defaultValue: 'story-{_NumberAuto}',
        placeholder: 'story-{_NumberAuto}',
        help: 'Supports {_NumberAuto}. Prefixes are independent (story vs short-story).',
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        defaultValue: 'text',
        options: [
          { label: 'Plain text', value: 'text' },
          { label: 'JSON', value: 'json' },
        ],
      },
    ],
  }),
  def({
    id: 'clipboard.read',
    name: 'Read Clipboard',
    category: 'clipboard',
    description: 'Read clipboard into variable',
    icon: 'ClipboardList',
    fields: [{ key: 'outputKey', label: 'Output variable', type: 'string', defaultValue: 'clipboard' }],
  }),
]

const screenshotActions: ActionDefinition[] = [
  def({
    id: 'screenshot.full',
    name: 'Full Screenshot',
    category: 'screenshot',
    description: 'Capture visible tab screenshot (metadata logged)',
    icon: 'Camera',
    fields: [{ key: 'label', label: 'Label', type: 'string', defaultValue: 'screenshot' }],
  }),
]

export const ACTION_LIBRARY: ActionDefinition[] = [
  ...flowActions,
  ...browserActions,
  ...mouseActions,
  ...keyboardActions,
  ...inputActions,
  ...elementActions,
  ...variableActions,
  ...conditionActions,
  ...loopActions,
  ...waitActions,
  ...aiActions,
  ...dataActions,
  ...downloadActions,
  ...clipboardActions,
  ...loggingActions,
  ...screenshotActions,
]

export const ACTION_CATEGORIES: ActionCategory[] = [
  'flow',
  'browser',
  'mouse',
  'keyboard',
  'input',
  'element',
  'ai',
  'wait',
  'variables',
  'conditions',
  'loops',
  'data',
  'downloads',
  'clipboard',
  'screenshot',
  'logging',
]

export function getActionById(id: string): ActionDefinition | undefined {
  return ACTION_LIBRARY.find((action) => action.id === id)
}

export function searchActions(query: string): ActionDefinition[] {
  const q = query.trim().toLowerCase()
  if (!q) return ACTION_LIBRARY
  return ACTION_LIBRARY.filter(
    (action) =>
      action.name.toLowerCase().includes(q) ||
      action.id.toLowerCase().includes(q) ||
      action.description.toLowerCase().includes(q) ||
      action.category.includes(q),
  )
}
