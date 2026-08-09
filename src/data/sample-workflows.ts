import type { WorkflowDefinition } from '@/shared/types/workflow'

const now = new Date().toISOString()

export const sampleWorkflows: WorkflowDefinition[] = [
  {
    id: 'wf_chatgpt_open_send',
    name: 'ChatGPT · Open → Type → Send',
    description:
      'প্রথমে https://chatgpt.com খোলে, prompt লেখে, তারপর Send বাটনে ক্লিক করে। বাটন selector Dashboard → Selector Lab থেকে পিক করে params.selector-এ বসান।',
    version: '1.0.0',
    tags: ['chatgpt', 'starter'],
    variables: {
      prompt: 'Say hello in one short sentence.',
    },
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 'cg_open',
        type: 'open_url',
        name: 'Open ChatGPT',
        enabled: true,
        timeoutMs: 45000,
        continueOnError: false,
        params: {
          url: 'https://chatgpt.com/',
          active: true,
        },
      },
      {
        id: 'cg_wait_input',
        type: 'wait_for_element',
        name: 'Wait for prompt box',
        enabled: true,
        timeoutMs: 45000,
        continueOnError: false,
        retry: {
          maxAttempts: 3,
          backoffMs: 1000,
          backoffMultiplier: 2,
          retryOn: ['TimeoutError', 'ElementNotFoundError'],
        },
        params: {
          // Selector Lab দিয়ে পিক করে এখানে বসাতে পারেন
          selector: '#prompt-textarea, div[contenteditable="true"]#prompt-textarea, div[contenteditable="true"]',
        },
      },
      {
        id: 'cg_type',
        type: 'type_text',
        name: 'Type prompt',
        enabled: true,
        timeoutMs: 20000,
        continueOnError: false,
        params: {
          selector: '#prompt-textarea, div[contenteditable="true"]#prompt-textarea, div[contenteditable="true"]',
          text: '{{prompt}}',
        },
      },
      {
        id: 'cg_click_send',
        type: 'click',
        name: 'Click Send button',
        enabled: true,
        timeoutMs: 20000,
        continueOnError: false,
        retry: {
          maxAttempts: 3,
          backoffMs: 800,
          backoffMultiplier: 2,
          retryOn: ['TimeoutError', 'ElementNotFoundError'],
        },
        params: {
          // ChatGPT Send বাটনের ডিফল্ট selector - ভুল হলে Selector Lab দিয়ে নতুনটা নিন
          selector: 'button[data-testid="send-button"], button[aria-label*="Send"]',
        },
      },
    ],
  },
  {
    id: 'wf_demo_research',
    name: 'Research → Image → TTS Pipeline',
    description:
      'Configurable multi-service pipeline. Selectors and URLs are data-driven - swap modules without code changes.',
    version: '1.0.0',
    tags: ['demo', 'pipeline'],
    variables: {
      projectName: 'demo-project',
      topic: 'A calm sunrise over misty hills',
    },
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 'step_set_topic',
        type: 'set_variable',
        name: 'Set topic variable',
        enabled: true,
        timeoutMs: 5000,
        continueOnError: false,
        params: {
          key: 'prompt',
          value: 'Write a short 2-sentence narration about: {{topic}}',
        },
      },
      {
        id: 'step_open_docs',
        type: 'open_url',
        name: 'Open documentation tab',
        enabled: true,
        timeoutMs: 30000,
        continueOnError: false,
        params: {
          url: 'https://example.com',
          active: true,
        },
      },
      {
        id: 'step_wait_heading',
        type: 'wait_for_element',
        name: 'Wait for page heading',
        enabled: true,
        timeoutMs: 15000,
        continueOnError: true,
        retry: {
          maxAttempts: 2,
          backoffMs: 800,
          backoffMultiplier: 2,
          retryOn: ['TimeoutError', 'ElementNotFoundError'],
        },
        params: {
          selector: 'h1',
        },
      },
      {
        id: 'step_extract',
        type: 'extract_text',
        name: 'Extract heading text',
        enabled: true,
        timeoutMs: 10000,
        continueOnError: true,
        outputKey: 'pageHeading',
        params: {
          selector: 'h1',
        },
      },
      {
        id: 'step_organize',
        type: 'organize_folder',
        name: 'Resolve project folder',
        enabled: true,
        timeoutMs: 5000,
        continueOnError: false,
        outputKey: 'projectPath',
        params: {
          projectName: '{{projectName}}',
          rootFolder: 'AutomationEngine',
          subfolder: 'assets',
        },
      },
    ],
  },
  {
    id: 'wf_smoke_dom',
    name: 'DOM Smoke Test',
    description: 'Validates core automation primitives against example.com',
    version: '1.0.0',
    tags: ['smoke', 'dom'],
    variables: {},
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: 'smoke_open',
        type: 'open_url',
        name: 'Open example.com',
        enabled: true,
        timeoutMs: 30000,
        continueOnError: false,
        params: { url: 'https://example.com' },
      },
      {
        id: 'smoke_wait',
        type: 'wait_for_text',
        name: 'Wait for Example Domain text',
        enabled: true,
        timeoutMs: 15000,
        continueOnError: false,
        params: { text: 'Example Domain' },
      },
      {
        id: 'smoke_assert',
        type: 'assert_element',
        name: 'Assert more information link',
        enabled: true,
        timeoutMs: 10000,
        continueOnError: false,
        params: { selector: 'a' },
      },
      {
        id: 'smoke_click',
        type: 'click',
        name: 'Click first link',
        enabled: true,
        timeoutMs: 10000,
        continueOnError: false,
        params: { selector: 'a' },
      },
    ],
  },
]
