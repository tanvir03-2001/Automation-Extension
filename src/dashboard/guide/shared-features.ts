import type { FeatureGuide, SharedFeatureId } from '@/dashboard/guide/types'

/** Panels shared by most events in Properties (same UI as Click). */
export const SHARED_FEATURES: Record<SharedFeatureId, FeatureGuide> = {
  test: {
    id: 'test',
    title: { en: 'Test event', bn: 'টেস্ট ইভেন্ট' },
    what: {
      en: 'Runs only this one event on the currently active website tab (any http/https site)—not the whole workflow, and not locked to ChatGPT.',
      bn: 'পুরো ওয়ার্কফ্লো না চালিয়ে শুধু এই ইভেন্ট চালায়—বর্তমানে যে ওয়েবসাইট ট্যাব অ্যাকটিভ আছে (যেকোনো http/https) সেখানে; ChatGPT-তে আটকে নয়।',
    },
    why: {
      en: 'Use it while building: focus the target page, then confirm click/type/wait before wiring a long chain.',
      bn: 'বিল্ড করার সময়: টার্গেট পেজ ফোকাস করে ক্লিক/টাইপ/ওয়েট ঠিকমতো কাজ করে কিনা দেখুন।',
    },
    how: {
      en: 'Focus the website tab → select the step → Properties → Test → Run test. Full plan Run still uses the tab from Open URL.',
      bn: 'ওয়েবসাইট ট্যাব ফোকাস → স্টেপ সিলেক্ট → Properties → Test → Run test। পুরো প্ল্যান Run হলে Open URL যে ট্যাব খোলে সেটাতেই চলবে।',
    },
    example: {
      en: 'Open any site → focus that tab → Pick a button → Run test on Click. Fix the selector if it fails.',
      bn: 'যেকোনো সাইট খুলুন → ট্যাব ফোকাস → বাটন পিক → Click-এ Run test। ফেইল হলে সিলেক্টর ঠিক করুন।',
    },
  },
  dependencies: {
    id: 'dependencies',
    title: { en: 'Dependencies', bn: 'ডিপেন্ডেন্সি' },
    what: {
      en: 'Optional rules. The event runs only when variable / dataset / history checks pass. Match ALL (AND) or Match ANY (OR).',
      bn: 'ঐচ্ছিক রুল। ভেরিয়েবল / ডেটাসেট / হিস্টরি চেক পাস করলেই ইভেন্ট চলে। সব মিললে (AND) বা যেকোনো একটা মিললে (OR)।',
    },
    why: {
      en: 'Skip a click when login failed, or only click Download when a variable like item.status exists.',
      bn: 'লগইন ফেইল হলে ক্লিক স্কিপ করুন, অথবা item.status-এর মতো ভেরিয়েবল থাকলেই Download ক্লিক করুন।',
    },
    how: {
      en: 'Add rule → pick Source (Variable / Dataset / History) → operator (exists, eq, contains…) → path (e.g. item.status). No rules = always runs.',
      bn: 'Add rule → Source বাছুন (Variable / Dataset / History) → অপারেটর (exists, eq, contains…) → path দিন (যেমন item.status)। রুল না থাকলে সবসময় চলে।',
    },
    example: {
      en: 'Variable · exists · isLoggedIn - only then run Click on “Continue”.',
      bn: 'Variable · exists · isLoggedIn - শুধু তখনই “Continue” এ Click চলবে।',
    },
  },
  timeout: {
    id: 'timeout',
    title: { en: 'Timeout (ms)', bn: 'টাইমআউট (ms)' },
    what: {
      en: 'How long the engine waits for the target (or condition) before treating the event as failed. Default is often 30000 (30s).',
      bn: 'টার্গেট বা কন্ডিশনের জন্য ইঞ্জিন কতক্ষণ অপেক্ষা করবে; এর পর ফেইল ধরা হয়। ডিফল্ট প্রায়ই ৩০০০০ (৩০ সেকেন্ড)।',
    },
    why: {
      en: 'Slow SPA pages and AI replies need longer waits; simple static buttons can use shorter timeouts.',
      bn: 'ধীর SPA পেজ ও AI রিপ্লাইতে বেশি সময় লাগে; সাধারণ স্ট্যাটিক বাটনে কম টাইমআউটই যথেষ্ট।',
    },
    how: {
      en: 'In Execution, set Timeout (ms). Pair with Pre-wait if the page needs to settle first.',
      bn: 'Execution-এ Timeout (ms) সেট করুন। পেজ স্থির হওয়া দরকার হলে Pre-wait-ও ব্যবহার করুন।',
    },
    example: {
      en: 'Click on a late-loading “Generate” button → Timeout 45000.',
      bn: 'দেরিতে আসা “Generate” বাটনে Click → Timeout 45000।',
    },
  },
  onFailure: {
    id: 'onFailure',
    title: { en: 'On failure', bn: 'ফেইল হলে' },
    what: {
      en: 'What happens if this event fails: stop, retry, retry forever, ignore, jump to a step, run another plan/workflow, notify, screenshot, or log.',
      bn: 'ইভেন্ট ফেইল হলে কী হবে: থামা, রিট্রাই, চিরকাল রিট্রাই, ইগনোর, অন্য স্টেপে যাওয়া, অন্য প্ল্যান/ওয়ার্কফ্লো, নোটিফাই, স্ক্রিনশট, বা লগ।',
    },
    why: {
      en: 'Keep critical steps strict (stop), but make optional UI clicks resilient (ignore / retry).',
      bn: 'গুরুত্বপূর্ণ স্টেপ কঠোর রাখুন (stop); ঐচ্ছিক UI ক্লিক সহনশীল করুন (ignore / retry)।',
    },
    how: {
      en: 'Choose strategy under Execution → On failure. For retry, set Max retries and Retry delay. For goto / recovery, pick the target step or plan.',
      bn: 'Execution → On failure থেকে স্ট্র্যাটেজি বাছুন। রিট্রাইতে Max retries ও Retry delay দিন। goto / recovery-তে টার্গেট স্টেপ বা প্ল্যান বাছুন।',
    },
    example: {
      en: 'Cookie banner Click → On failure: ignore. Login Submit → On failure: stop.',
      bn: 'কুকি ব্যানার Click → On failure: ignore। Login Submit → On failure: stop।',
    },
  },
  preWait: {
    id: 'preWait',
    title: { en: 'Pre-wait strategy', bn: 'প্রি-ওয়েট স্ট্র্যাটেজি' },
    what: {
      en: 'Optional wait before the main action: none, fixed/random delay, network idle, DOM stable, URL contains, element, or text.',
      bn: 'মূল অ্যাকশনের আগে ঐচ্ছিক অপেক্ষা: none, নির্দিষ্ট/র‍্যান্ডম ডিলে, network idle, DOM stable, URL contains, element, বা text।',
    },
    why: {
      en: 'Clicks fail when the page is still loading or animating. Pre-wait reduces flaky failures.',
      bn: 'পেজ এখনও লোড/অ্যানিমেট হলে ক্লিক ফেইল হয়। Pre-wait ফ্লেকি ফেইল কমায়।',
    },
    how: {
      en: 'Set Pre-wait in Execution. For element/text/url strategies, fill the matching field (selector, text, or URL fragment).',
      bn: 'Execution-এ Pre-wait সেট করুন। element/text/url স্ট্র্যাটেজিতে মিলিয়ে ফিল্ড পূরণ করুন (selector, text, বা URL অংশ)।',
    },
    example: {
      en: 'After Open URL → Click with Pre-wait: network_idle so ads/scripts settle.',
      bn: 'Open URL-এর পর → Click-এ Pre-wait: network_idle যাতে অ্যাড/স্ক্রিপ্ট থেমে যায়।',
    },
  },
  interaction: {
    id: 'interaction',
    title: { en: 'Interaction options', bn: 'ইন্টারঅ্যাকশন অপশন' },
    what: {
      en: 'Browser helpers before/during click-like actions: scroll into view, dismiss overlays, wait until enabled, force click, find on any open tab, stabilize delay.',
      bn: 'ক্লিক-জাতীয় অ্যাকশনের আগে/সময় ব্রাউজার হেল্পার: স্ক্রল করে দেখানো, ওভারলে সরানো, এনাবল না হওয়া পর্যন্ত ওয়েট, ফোর্স ক্লিক, যেকোনো ওপেন ট্যাবে খোঁজা, স্ট্যাবিলাইজ ডিলে।',
    },
    why: {
      en: 'Modern apps hide controls below the fold, under modals, or keep them disabled until validation passes. Popups and new windows open outside the working tab.',
      bn: 'আধুনিক অ্যাপে কন্ট্রোল নিচে থাকে, মোডালের নিচে লুকানো থাকে, বা ভ্যালিডেশন না হওয়া পর্যন্ত ডিজেবল থাকে। পপআপ/নতুন উইন্ডো ওয়ার্কিং ট্যাবের বাইরে খোলে।',
    },
    how: {
      en: 'In Execution → Interaction, toggle the checkboxes you need. Leave Force click off unless normal click keeps failing. Enable Find target on any open tab when the control may appear in a popup or another tab.',
      bn: 'Execution → Interaction-এ প্রয়োজনীয় চেকবক্স চালু করুন। সাধারণ ক্লিক বারবার ফেইল না হলে Force click বন্ধ রাখুন। পপআপ বা অন্য ট্যাবে কন্ট্রোল থাকতে পারে এমন কেসে যেকোনো ওপেন ট্যাবে টার্গেট খুঁজো চালু করুন।',
    },
    example: {
      en: 'Long settings page: Scroll into view + Wait until enabled. After a click opens a popup: Find target on any open tab.',
      bn: 'লম্বা সেটিংস পেজ: Scroll into view + Wait until enabled। ক্লিকে পপআপ খুললে: যেকোনো ওপেন ট্যাবে টার্গেট খুঁজো।',
    },
  },
}

export const SHARED_FEATURE_ORDER: SharedFeatureId[] = [
  'test',
  'dependencies',
  'timeout',
  'onFailure',
  'preWait',
  'interaction',
]

/** Categories that typically show Execution + Interaction panels. */
export const CATEGORIES_WITH_INTERACTION = new Set([
  'mouse',
  'keyboard',
  'input',
  'element',
  'ai',
  'clipboard',
  'downloads',
  'browser',
])
