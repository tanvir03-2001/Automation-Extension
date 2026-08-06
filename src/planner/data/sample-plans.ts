import type { AutomationPlan, VisualWorkflow } from '@/planner/types/plan'

const now = new Date().toISOString()

export const samplePlans: AutomationPlan[] = [
  {
    id: 'plan_chatgpt_starter',
    name: 'ChatGPT Starter Plan',
    description: 'Visual plan: open ChatGPT → paste prompt → send → wait response',
    color: '#0f766e',
    tags: ['chatgpt', 'starter'],
    workflowIds: ['vwf_chatgpt_main'],
    textLibraries: [
      {
        id: 'lib_story_titles',
        name: 'story title',
        updatedAt: now,
        items: [
          { id: 'ti_1', title: 'Sleeping on Mars', text: 'Sleeping on Mars' },
          { id: 'ti_2', title: 'Journey Through the Galaxy', text: 'Journey Through the Galaxy' },
          {
            id: 'ti_3',
            title: 'A Walk Through a Quiet Village',
            text: 'A Walk Through a Quiet Village',
          },
          { id: 'ti_4', title: 'The Old Lighthouse', text: 'The Old Lighthouse' },
          {
            id: 'ti_5',
            title: 'Overnight Train Across America',
            text: 'Overnight Train Across America',
          },
          { id: 'ti_6', title: 'The Enchanted Library', text: 'The Enchanted Library' },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
]

export const sampleVisualWorkflows: VisualWorkflow[] = [
  {
    id: 'vwf_chatgpt_main',
    planId: 'plan_chatgpt_starter',
    name: 'ChatGPT Main Flow',
    description: 'Drag-and-drop ChatGPT automation',
    enabled: true,
    color: '#0f766e',
    tags: ['ai'],
    variables: {
      prompt: 'Say hello in one short sentence.',
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    versions: [],
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: 'n_start',
        type: 'start',
        position: { x: 80, y: 180 },
        data: {
          actionId: 'flow.start',
          label: 'Start',
          enabled: true,
          collapsed: false,
          favorite: false,
          params: {},
          timeoutMs: 5000,
        },
      },
      {
        id: 'n_open',
        type: 'action',
        position: { x: 280, y: 160 },
        data: {
          actionId: 'ai.open_chatgpt',
          label: 'Open ChatGPT',
          enabled: true,
          collapsed: false,
          favorite: true,
          color: '#16a34a',
          params: { url: 'https://chatgpt.com/', active: true },
          timeoutMs: 45000,
        },
      },
      {
        id: 'n_wait',
        type: 'action',
        position: { x: 520, y: 160 },
        data: {
          actionId: 'element.wait_visible',
          label: 'Wait Prompt Box',
          enabled: true,
          collapsed: false,
          favorite: false,
          params: {},
          selector: {
            primary: '#prompt-textarea, div[contenteditable="true"]',
            fallbacks: ['div[contenteditable="true"]'],
            strategy: 'css',
            autoHeal: true,
          },
          timeoutMs: 45000,
        },
      },
      {
        id: 'n_prompt',
        type: 'action',
        position: { x: 760, y: 160 },
        data: {
          actionId: 'ai.paste_prompt',
          label: 'Paste Prompt',
          enabled: true,
          collapsed: false,
          favorite: false,
          params: {
            prompt: '{{prompt}}',
            selector: '#prompt-textarea, div[contenteditable="true"]',
          },
          timeoutMs: 20000,
        },
      },
      {
        id: 'n_send',
        type: 'action',
        position: { x: 1000, y: 160 },
        data: {
          actionId: 'ai.click_send',
          label: 'Click Send',
          enabled: true,
          collapsed: false,
          favorite: false,
          params: {
            selector: 'button[data-testid="send-button"], button[aria-label*="Send"]',
          },
          selector: {
            primary: 'button[data-testid="send-button"], button[aria-label*="Send"]',
            fallbacks: ['button[aria-label*="Send"]'],
            strategy: 'css',
            autoHeal: true,
          },
          errorPolicy: {
            strategy: 'retry',
            maxRetries: 3,
            retryDelayMs: 1000,
          },
          timeoutMs: 20000,
        },
      },
      {
        id: 'n_end',
        type: 'end',
        position: { x: 1240, y: 180 },
        data: {
          actionId: 'flow.end',
          label: 'End',
          enabled: true,
          collapsed: false,
          favorite: false,
          params: {},
          timeoutMs: 5000,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'n_start', target: 'n_open', sourceHandle: 'out' },
      { id: 'e2', source: 'n_open', target: 'n_wait', sourceHandle: 'out' },
      { id: 'e3', source: 'n_wait', target: 'n_prompt', sourceHandle: 'out' },
      { id: 'e4', source: 'n_prompt', target: 'n_send', sourceHandle: 'out' },
      { id: 'e5', source: 'n_send', target: 'n_end', sourceHandle: 'out' },
    ],
  },
]
