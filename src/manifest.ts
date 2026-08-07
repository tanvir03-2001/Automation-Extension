import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Automation Engine',
  version: '1.0.0',
  description:
    'Enterprise browser automation engine for configurable multi-step workflows across external web services.',
  action: {
    default_title: 'Open Automation Dashboard',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: [
    'tabs',
    'storage',
    'scripting',
    'downloads',
    'alarms',
    'windows',
    'activeTab',
    'debugger',
  ],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/dashboard/index.html', 'assets/*'],
      matches: ['<all_urls>'],
    },
  ],
})
