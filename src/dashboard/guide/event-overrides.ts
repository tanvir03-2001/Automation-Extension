import type { EventGuideOverride } from '@/dashboard/guide/types'

/**
 * Click-level (and richer) bilingual guides for key events.
 * Remaining events auto-build from catalog + action-docs + shared panels.
 */
export const EVENT_GUIDE_OVERRIDES: Record<string, EventGuideOverride> = {
  'mouse.click': {
    whenWhy: {
      en: 'Use Click on any website whenever a real user would press a button, tab, icon, checkbox, or link. After Open URL in a full Run, clicks stay on that page; Pick/Test use the active tab.',
      bn: 'যেকোনো ওয়েবসাইটে বাটন, ট্যাব, আইকন, চেকবক্স বা লিঙ্কে ক্লিক করতে Click ব্যবহার করুন। পুরো Run-এ Open URL-এর পেজেই ক্লিক হয়; Pick/Test বর্তমান অ্যাকটিভ ট্যাবে কাজ করে।',
    },
    example: {
      en: 'Start → Open URL (your site) → Wait For Page → Click (pick the real button on the active tab) → next step. Interaction: Scroll into view + Wait until enabled.',
      bn: 'Start → Open URL (আপনার সাইট) → Wait For Page → Click (অ্যাকটিভ ট্যাবে আসল বাটন পিক) → পরের স্টেপ। Interaction: Scroll into view + Wait until enabled।',
    },
    howto: {
      en: [
        'Drag Click from the Mouse category onto the canvas.',
        'Focus the target website tab → Properties → Pick with mouse → hover any element and click (Hold Shift = snap to button).',
        'Review Dependencies if this click should only run when a variable/dataset rule passes.',
        'In Execution: set Timeout, On failure (usually stop), Pre-wait if the page is slow, and Interaction checkboxes.',
        'Expand Test → focus the same website tab → Run test. For full Run, place Open URL first so the plan uses that tab.',
      ],
      bn: [
        'Mouse ক্যাটাগরি থেকে Click ক্যানভাসে টেনে আনুন।',
        'টার্গেট ওয়েবসাইট ট্যাব ফোকাস → Properties → Pick with mouse → যেকোনো এলিমেন্টে হোভার করে ক্লিক (Shift = বাটনে স্ন্যাপ)।',
        'ক্লিক শুধু নির্দিষ্ট ভেরিয়েবল/ডেটাসেট রুল মিললে চলবে হলে Dependencies সেট করুন।',
        'Execution-এ Timeout, On failure (সাধারণত stop), ধীর পেজে Pre-wait, আর Interaction চেকবক্স দেখুন।',
        'Test এক্সপ্যান্ড → একই ওয়েবসাইট ট্যাব ফোকাস → Run test। পুরো Run-এ আগে Open URL রাখুন যাতে সেই ট্যাবেই চলে।',
      ],
    },
    features: [
      {
        id: 'pick',
        title: { en: 'Pick with mouse', bn: 'মাউস দিয়ে পিক' },
        what: {
          en: 'Highlights and selects any visible DOM element under the cursor on the active tab (exact node). Hold Shift to snap to a button/link host.',
          bn: 'অ্যাকটিভ ট্যাবে কার্সারের নিচে যেকোনো দৃশ্যমান DOM এলিমেন্ট হাইলাইট ও সিলেক্ট করে (এক্সহ্যাক্ট নোড)। বাটন/লিঙ্কে স্ন্যাপ করতে Shift ধরুন।',
        },
        why: {
          en: 'Modern sites use nested divs/SVGs—not only buttons. Exact pick lets you target composers, icons, labels, and containers.',
          bn: 'আধুনিক সাইটে শুধু বাটন নয়—নেস্টেড div/SVGও থাকে। এক্সহ্যাক্ট পিকে কম্পোজার, আইকন, লেবেল, কন্টেইনার টার্গেট করা যায়।',
        },
        how: {
          en: 'Focus the site tab → Pick with mouse → hover the exact element → click. Use Shift when you want the outer button instead of the inner SVG.',
          bn: 'সাইট ট্যাব ফোকাস → Pick with mouse → এক্সহ্যাক্ট এলিমেন্টে হোভার → ক্লিক। ভিতরের SVG-র বদলে বাইরের বাটন চাইলে Shift ব্যবহার করুন।',
        },
        example: {
          en: 'Pick a message box, a paperclip icon, or a sidebar row—each becomes its own selector + fallbacks.',
          bn: 'মেসেজ বক্স, পেপারক্লিপ আইকন, বা সাইডবার রো—প্রতিটার আলাদা সিলেক্টর + ফলব্যাক সেভ হবে।',
        },
      },
      {
        id: 'selector',
        title: { en: 'Selector', bn: 'সিলেক্টর' },
        what: {
          en: 'The address of the element to click (CSS / ARIA / text-backed). Usually filled by Pick.',
          bn: 'যে এলিমেন্টে ক্লিক হবে তার অ্যাড্রেস (CSS / ARIA / টেক্সট)। সাধারণত পিক দিয়ে ভরে।',
        },
        why: {
          en: 'Without a selector the engine cannot know which control to click.',
          bn: 'সিলেক্টর ছাড়া ইঞ্জিন বুঝতে পারে না কোন কন্ট্রোলে ক্লিক করতে হবে।',
        },
        how: {
          en: 'Prefer Pick. Only edit manually if you know a stable selector from Selector Lab.',
          bn: 'পিকই ভালো। Selector Lab থেকে স্থিতিশীল সিলেক্টর জানলে তবেই ম্যানুয়াল এডিট করুন।',
        },
        example: {
          en: 'After Pick: a short ARIA/CSS value appears in the Selector field - leave it unless Test fails.',
          bn: 'পিকের পর Selector ফিল্ডে ছোট ARIA/CSS মান আসে - Test ফেইল না হলে সেটাই রাখুন।',
        },
      },
      {
        id: 'scrollIntoView',
        title: {
          en: 'Scroll into view before click',
          bn: 'ক্লিকের আগে স্ক্রল করে দেখাও',
        },
        what: {
          en: 'Scrolls the target into the viewport before clicking (on by default).',
          bn: 'ক্লিকের আগে টার্গেট ভিউপোর্টে স্ক্রল করে আনে (ডিফল্টে চালু)।',
        },
        why: {
          en: 'Elements below the fold or in long panels are not clickable until visible.',
          bn: 'পেজের নিচে বা লম্বা প্যানেলে থাকা এলিমেন্ট দৃশ্যমান না হলে ক্লিক হয় না।',
        },
        how: {
          en: 'Keep checked for almost all clicks. Turn off only for fixed overlays that must not scroll.',
          bn: 'প্রায় সব ক্লিকে চেক রাখুন। শুধু যেসব ফিক্সড ওভারলে স্ক্রল করা যাবে না - সেখানে বন্ধ করুন।',
        },
        example: {
          en: 'Footer “Save” on a long form - leave Scroll into view on.',
          bn: 'লম্বা ফর্মের ফুটার “Save” - Scroll into view চালু রাখুন।',
        },
      },
      {
        id: 'dismissOverlays',
        title: { en: 'Dismiss overlays first', bn: 'আগে ওভারলে সরান' },
        what: {
          en: 'Tries to close cookie/modals/backdrops that may cover the target before clicking.',
          bn: 'ক্লিকের আগে টার্গেট ঢেকে রাখা কুকি/মোডাল/ব্যাকড্রপ বন্ধ করার চেষ্টা করে।',
        },
        why: {
          en: 'A covered button looks “picked” but the click hits the overlay instead.',
          bn: 'ঢাকা বাটন পিক করা গেলেও ক্লিক ওভারলেতে পড়ে।',
        },
        how: {
          en: 'Enable when popups are common on that site. Combine with element.dismiss_overlay for stubborn cases.',
          bn: 'যে সাইটে পপআপ বেশি সেখানে চালু করুন। জটিল কেসে element.dismiss_overlay-ও যোগ করুন।',
        },
        example: {
          en: 'Marketing site with cookie banner before Login → turn on Dismiss overlays.',
          bn: 'লগইনের আগে কুকি ব্যানার থাকা মার্কেটিং সাইট → Dismiss overlays চালু করুন।',
        },
      },
      {
        id: 'waitEnabled',
        title: {
          en: 'Wait until element enabled',
          bn: 'এলিমেন্ট এনাবল না হওয়া পর্যন্ত অপেক্ষা',
        },
        what: {
          en: 'Waits until the control is not disabled/grayed-out before clicking (on by default).',
          bn: 'কন্ট্রোল ডিজেবল/ধূসর না থাকা পর্যন্ত অপেক্ষা করে তারপর ক্লিক করে (ডিফল্টে চালু)।',
        },
        why: {
          en: 'Submit/Send often stays disabled until the form or prompt is valid.',
          bn: 'ফর্ম বা প্রম্পট ঠিক না হওয়া পর্যন্ত Submit/Send প্রায়ই ডিজেবল থাকে।',
        },
        how: {
          en: 'Keep on for forms and AI Send. Raise Timeout if validation is slow.',
          bn: 'ফর্ম ও AI Send-এ চালু রাখুন। ভ্যালিডেশন ধীর হলে Timeout বাড়ান।',
        },
        example: {
          en: 'Type Text → Click Send with Wait until enabled so Send is not pressed while gray.',
          bn: 'Type Text → Click Send-এ Wait until enabled রাখুন যাতে ধূসর অবস্থায় Send না চাপে।',
        },
      },
      {
        id: 'forceClick',
        title: { en: 'Force click (last resort)', bn: 'ফোর্স ক্লিক (শেষ উপায়)' },
        what: {
          en: 'Bypasses some readiness checks to fire a click faster / more aggressively.',
          bn: 'কিছু রেডিনেস চেক এড়িয়ে দ্রুত/জোরে ক্লিক ফায়ার করে।',
        },
        why: {
          en: 'Only when a normal click keeps failing on a stubborn control.',
          bn: 'সাধারণ ক্লিক বারবার ফেইল হলেই - জেদি কন্ট্রোলে।',
        },
        how: {
          en: 'Leave off by default. Enable, Run test, then prefer fixing selector/wait if force is flaky.',
          bn: 'ডিফল্টে বন্ধ রাখুন। চালু করে Test করুন; ফ্লেকি হলে সিলেক্টর/ওয়েট ঠিক করাই ভালো।',
        },
        example: {
          en: 'Custom canvas button that never reports “enabled” → try Force click after other options fail.',
          bn: 'কাস্টম ক্যানভাস বাটন কখনো “enabled” না দেখালে → অন্য অপশন ফেল করলে Force click চেষ্টা করুন।',
        },
      },
      {
        id: 'searchAnyTab',
        title: {
          en: 'Find target on any open tab',
          bn: 'যেকোনো ওপেন ট্যাবে টার্গেট খুঁজো',
        },
        what: {
          en: 'Looks for the selector on every open http(s) tab and popup window, not only the working tab.',
          bn: 'শুধু ওয়ার্কিং ট্যাব নয় — সব ওপেন http(s) ট্যাব ও পপআপ উইন্ডোতে সিলেক্টর খোঁজে।',
        },
        why: {
          en: 'A prior click may open a new tab or popup; the next step’s target lives there.',
          bn: 'আগের ক্লিকে নতুন ট্যাব/পপআপ খুলতে পারে; পরের ধাপের টার্গেট সেখানে থাকে।',
        },
        how: {
          en: 'Enable on the step that must run on the other page. Popups may take a few seconds to appear — the step keeps searching until Timeout. On success that tab becomes the working tab for later steps.',
          bn: 'যে ধাপ অন্য পেজে চলবে সেখানে চালু করুন। পপআপ আসতে কয়েক সেকেন্ড লাগতে পারে — Timeout পর্যন্ত খুঁজতে থাকবে। সফল হলে সেই ট্যাব পরের ধাপের ওয়ার্কিং ট্যাব হয়।',
        },
        example: {
          en: 'Click “Sign in with Google” (opens popup) → next Click with Find target on any open tab on the account row.',
          bn: '“Sign in with Google”-এ Click (পপআপ খোলে) → পরের Click-এ যেকোনো ওপেন ট্যাবে টার্গেট খুঁজো দিয়ে অ্যাকাউন্ট রো।',
        },
      },
    ],
  },

  'mouse.double_click': {
    whenWhy: {
      en: 'Use when the site needs a double-click (rename file, open item, map tools) - not a single Click.',
      bn: 'যেখানে ডাবল-ক্লিক লাগে (ফাইল রিনেম, আইটেম খোলা, ম্যাপ টুল) - সিঙ্গেল Click নয়।',
    },
    example: {
      en: 'Pick a file row → Double Click to open. Keep Scroll into view on.',
      bn: 'ফাইল রো পিক → খুলতে Double Click। Scroll into view চালু রাখুন।',
    },
  },

  'mouse.right_click': {
    whenWhy: {
      en: 'Opens the context menu on an element (copy, open in new tab, custom app menus).',
      bn: 'এলিমেন্টে কনটেক্সট মেনু খোলে (কপি, নতুন ট্যাবে খোলা, অ্যাপের কাস্টম মেনু)।',
    },
    example: {
      en: 'Right Click a table row → then Click the menu item “Export”.',
      bn: 'টেবিল রোতে Right Click → তারপর মেনু আইটেম “Export”-এ Click।',
    },
  },

  'mouse.hover': {
    whenWhy: {
      en: 'Reveal hover menus, tooltips, or lazy-loaded panels before a follow-up Click.',
      bn: 'হোভার মেনু, টুলটিপ বা লেজি-লোড প্যানেল দেখাতে - পরের Click-এর আগে।',
    },
    example: {
      en: 'Hover “Account” → Click “Settings” in the dropdown that appears.',
      bn: '“Account”-এ Hover → যে ড্রপডাউন আসে তাতে “Settings”-এ Click।',
    },
  },

  'mouse.drag_drop': {
    whenWhy: {
      en: 'Drag one element onto another (reorder lists, upload drop zones, kanban cards).',
      bn: 'এক এলিমেন্ট অন্যটার উপর টেনে ছাড়া (লিস্ট রিঅর্ডার, আপলোড ড্রপ জোন, কানবান কার্ড)।',
    },
    example: {
      en: 'Pick Source = card, Target = column B → Drag & Drop moves the card.',
      bn: 'Source = কার্ড, Target = কলাম B পিক → Drag & Drop কার্ড সরায়।',
    },
  },

  'mouse.click_coordinates': {
    whenWhy: {
      en: 'Click a fixed X/Y point when there is no stable element (canvas, map, custom drawing UI).',
      bn: 'স্থিতিশীল এলিমেন্ট না থাকলে নির্দিষ্ট X/Y পয়েন্টে ক্লিক (ক্যানভাস, ম্যাপ, কাস্টম ড্রয়িং UI)।',
    },
    example: {
      en: 'Set X=640 Y=360 to click the center of a 1280×720 canvas tool.',
      bn: '১২৮০×৭২০ ক্যানভাস টুলের মাঝে ক্লিক করতে X=640 Y=360 সেট করুন।',
    },
  },

  'keyboard.type_text': {
    whenWhy: {
      en: 'Type into chat boxes or inputs character-by-character (manual text, library, or {_template}).',
      bn: 'চ্যাট বক্স বা ইনপুটে অক্ষরে অক্ষরে টাইপ (ম্যানুয়াল, লাইব্রেরি, বা {_template})।',
    },
    example: {
      en: 'After Click New chat → Type Text from Story Title library → Click Send.',
      bn: 'Click New chat-এর পর → Story Title লাইব্রেরি থেকে Type Text → Click Send।',
    },
  },

  'keyboard.paste_text': {
    whenWhy: {
      en: 'Paste a full prompt instantly - same library/template features as Type Text, faster for long text.',
      bn: 'পুরো প্রম্পট একসাথে পেস্ট - Type Text-এর মতো লাইব্রেরি/টেমপ্লেট, লম্বা টেক্সটে দ্রুত।',
    },
    example: {
      en: 'Focus the prompt box → Paste Text with a long {_Story Title} template → Send.',
      bn: 'প্রম্পট বক্স ফোকাস → লম্বা {_Story Title} টেমপ্লেটসহ Paste Text → Send।',
    },
  },

  'browser.open_url': {
    whenWhy: {
      en: 'First navigation for a full plan/workflow Run—opens or reuses a tab for any website. Later steps use that tab only. (Event Test / Pick ignore this and use the active tab.)',
      bn: 'পুরো প্ল্যান/ওয়ার্কফ্লো Run-এর প্রথম ন্যাভিগেশন—যেকোনো ওয়েবসাইটের ট্যাব খোলে বা রিইউজ করে। পরের স্টেপ শুধু সেই ট্যাবে চলে। (Event Test / Pick এটা উপেক্ষা করে অ্যাকটিভ ট্যাব ব্যবহার করে।)',
    },
    example: {
      en: 'Start → Open URL https://example.com (Reuse existing tab on) → Wait For Page → Click / Type on that page.',
      bn: 'Start → Open URL https://example.com (Reuse existing tab চালু) → Wait For Page → সেই পেজে Click / Type।',
    },
  },

  'wait.delay': {
    whenWhy: {
      en: 'Fixed pause when the site needs a short settle time and no clear element signal exists.',
      bn: 'সাইটে ছোট স্থির সময় লাগে কিন্তু পরিষ্কার এলিমেন্ট সিগন্যাল নেই - তখন নির্দিষ্ট পজ।',
    },
    example: {
      en: 'After Click Download → Fixed Delay 2000ms → next step that needs the file dialog.',
      bn: 'Click Download-এর পর → Fixed Delay 2000ms → ফাইল ডায়ালগ লাগে এমন পরের স্টেপ।',
    },
  },

  'loops.map': {
    whenWhy: {
      en: 'Repeat a body of steps for each item in a Text library or Copy Store list.',
      bn: 'টেক্সট লাইব্রেরি বা Copy Store লিস্টের প্রতিটি আইটেমের জন্য বডি স্টেপ রিপিট।',
    },
    example: {
      en: 'Map over Story Titles → loop body: New chat → Type → Send → Wait → completed → End.',
      bn: 'Story Titles-এ Map → লুপ বডি: New chat → Type → Send → Wait → completed → End।',
    },
  },

  'conditions.if': {
    whenWhy: {
      en: 'Branch true/false on visibility, button name, number, page text, or variable.',
      bn: 'দৃশ্যমানতা, বাটন নাম, সংখ্যা, পেজ টেক্সট বা ভেরিয়েবল দেখে true/false ব্রাঞ্চ।',
    },
    example: {
      en: 'If “Continue” visible → true Click Continue; false → Click “Skip”.',
      bn: '“Continue” দেখা গেলে → true পথে Click Continue; false → Click “Skip”.',
    },
  },

  'flow.start': {
    whenWhy: {
      en: 'Every plan begins here. It does not touch the page - it only marks the entry.',
      bn: 'প্রতিটি প্ল্যান এখান থেকে শুরু। পেজে কিছু করে না - শুধু এন্ট্রি মার্ক করে।',
    },
    example: {
      en: 'Place Start on the left → connect its green out-dot to Open URL or your first action.',
      bn: 'বামে Start রাখুন → সবুজ আউট-ডট Open URL বা প্রথম অ্যাকশনে কানেক্ট করুন।',
    },
  },

  'flow.end': {
    whenWhy: {
      en: 'Marks a successful finish of the plan path.',
      bn: 'প্ল্যান পাথ সফলভাবে শেষ হওয়ার চিহ্ন।',
    },
    example: {
      en: 'Wire the last real action into End so the run status becomes completed.',
      bn: 'শেষ আসল অ্যাকশন End-এ যুক্ত করুন যাতে রান স্ট্যাটাস completed হয়।',
    },
  },
}
