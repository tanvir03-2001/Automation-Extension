/**
 * Generates src/shared/i18n/actions-bn.ts from tmp-actions-en.json + BN maps.
 * Run: node scripts/extract-actions-i18n.mjs && node scripts/generate-actions-bn.mjs
 */
import fs from 'fs'

const en = JSON.parse(fs.readFileSync('tmp-actions-en.json', 'utf8'))

/** @type {Record<string, { name: string, description: string, tooltip?: string, howto?: string[] }>} */
const BN = {
  'browser.open_url': {
    name: 'URL খুলুন',
    description: 'নতুন বা আগের ট্যাবে ওয়েবসাইট খোলে',
    tooltip: 'ওয়েবসাইট খোলে। সাইট আগেই খোলা থাকলে সেই ট্যাব ফোকাস করে।',
    howto: [
      'ক্যানভাসে Open URL টেনে আনুন।',
      'ওয়েবসাইট অ্যাড্রেস দিন (যেমন: https://chatgpt.com/)।',
      'সবুজ ডট দিয়ে Start → Open URL কানেক্ট করুন।',
      '“Reuse existing tab” চালু থাকলে নতুন ট্যাব না খুলে আগের ট্যাব ফোকাস হয়।',
    ],
  },
  'browser.refresh': {
    name: 'পেজ রিফ্রেশ',
    description: 'অ্যাক্টিভ ট্যাব রিলোড করে',
    tooltip: 'বর্তমান ট্যাব রিফ্রেশ করে।',
  },
  'browser.reload': {
    name: 'রিলোড',
    description: 'পেজ হার্ড রিলোড করে',
    tooltip: 'পেজ জোর করে আবার লোড করে।',
  },
  'browser.go_back': {
    name: 'পিছনে যান',
    description: 'হিস্টরিতে আগের পেজে যায়',
    tooltip: 'ব্রাউজারের Back বাটনের মতো।',
  },
  'browser.go_forward': {
    name: 'সামনে যান',
    description: 'হিস্টরিতে পরের পেজে যায়',
    tooltip: 'ব্রাউজারের Forward বাটনের মতো।',
  },
  'browser.close_tab': {
    name: 'ট্যাব বন্ধ',
    description: 'অ্যাক্টিভ বা নির্দিষ্ট ট্যাব বন্ধ করে',
    tooltip: 'ট্যাব বন্ধ করে।',
  },
  'browser.new_tab': {
    name: 'নতুন ট্যাব',
    description: 'খালি বা URL সহ নতুন ট্যাব খোলে',
    tooltip: 'নতুন ট্যাব খোলে।',
  },
  'browser.switch_tab': {
    name: 'ট্যাব পরিবর্তন',
    description: 'ট্যাব আইডি বা URL ম্যাচ দিয়ে ট্যাব অ্যাক্টিভ করে',
    tooltip: 'অন্য ট্যাবে সুইচ করে।',
  },
  'browser.focus_tab': {
    name: 'ট্যাব ফোকাস',
    description: 'অটোমেশন ট্যাব ফোকাস করে',
    tooltip: 'অটোমেশনের ট্যাব সামনে আনে।',
  },
  'browser.wait_for_page': {
    name: 'পেজ ওয়েট',
    description: 'ডকুমেন্ট লোড শেষ হওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'পেজ পুরোপুরি লোড হওয়া পর্যন্ত অপেক্ষা করে।',
    howto: [
      'পেজ লোড শেষ হওয়া পর্যন্ত থামে।',
      'Open URL / Open ChatGPT এর পরে রাখুন যাতে পরের ক্লিক নিরাপদ হয়।',
    ],
  },
  'browser.scroll': {
    name: 'স্ক্রল',
    description: 'পেজকে পিক্সেল অনুযায়ী স্ক্রল করে',
    tooltip: 'পেজ উপরে/নিচে স্ক্রল করে।',
  },
  'browser.scroll_to': {
    name: 'এলিমেন্টে স্ক্রল',
    description: 'এলিমেন্ট দেখা যায় এমন জায়গায় স্ক্রল করে',
    tooltip: 'পিক করা এলিমেন্ট পর্যন্ত স্ক্রল করে।',
  },
  'browser.download_file': {
    name: 'ফাইল ডাউনলোড',
    description: 'URL থেকে ফাইল ডাউনলোড করে',
    tooltip: 'লিংক থেকে ফাইল নামিয়ে নেয়।',
  },
  'browser.handle_dialog': {
    name: 'ডায়ালগ হ্যান্ডেল',
    description: 'অ্যালার্ট/কনফার্ম ডায়ালগ Accept বা Dismiss করে',
    tooltip: 'ব্রাউজার পপআপ Accept/Dismiss করে।',
  },
  'mouse.click': {
    name: 'ক্লিক',
    description: 'এলিমেন্টে ক্লিক করে',
    tooltip: 'পেজের এলিমেন্টে ক্লিক করে। মাউস দিয়ে টার্গেট পিক করুন।',
    howto: [
      'পেজের বাটন বা লিংকে ক্লিক করে।',
      'স্টেপ সিলেক্ট করে “Pick with mouse” দিয়ে আসল বাটন বেছে নিন (যেমন: New chat)।',
      'নতুন চ্যাট লাগলে Type Text এর আগে কানেক্ট করুন।',
    ],
  },
  'mouse.click_exact': {
    name: 'এক্স্যাক্ট ম্যাচ ক্লিক',
    description: 'যে এলিমেন্টের দেখা যাওয়া টেক্সট/লেবেল এক্স্যাক্ট মিলবে, সেটাতে ক্লিক করে',
    tooltip:
      'এক্স্যাক্ট টেক্সট/লেবেল ম্যাচ দিয়ে ক্লিক (যেমন Continue)। মাউস দিয়ে পিক করলে টেক্সট অটো ভরে।',
    howto: [
      'ক্যানভাসে Click Exact Match টেনে আনুন।',
      'এক্স্যাক্ট লেবেল টাইপ করুন, বা পেজের আসল এলিমেন্টে Pick with mouse করুন।',
      'পার্শিয়াল ম্যাচ উপেক্ষা - শুধু পুরো লেবেল মিললে ক্লিক হয়।',
      'লেবেল দেরিতে লোড হলে Wait For Page / Wait For Button এর পরে কানেক্ট করুন।',
    ],
  },
  'mouse.double_click': {
    name: 'ডাবল ক্লিক',
    description: 'এলিমেন্টে ডাবল ক্লিক করে',
    tooltip: 'দুবার ক্লিক করে।',
  },
  'mouse.right_click': {
    name: 'রাইট ক্লিক',
    description: 'এলিমেন্টে কনটেক্সট মেনু খোলে',
    tooltip: 'রাইট-ক্লিক মেনু খোলে।',
  },
  'mouse.hover': {
    name: 'হোভার',
    description: 'এলিমেন্টের উপর মাউস রাখে',
    tooltip: 'মাউস হোভার করে।',
  },
  'mouse.drag_drop': {
    name: 'ড্র্যাগ অ্যান্ড ড্রপ',
    description: 'সোর্সকে টার্গেটের উপর টেনে ফেলে',
    tooltip: 'এক জায়গা থেকে অন্য জায়গায় টেনে নিয়ে যায়।',
  },
  'mouse.click_coordinates': {
    name: 'কোঅর্ডিনেটে ক্লিক',
    description: 'x/y কোঅর্ডিনেটে ক্লিক করে',
    tooltip: 'স্ক্রিনের নির্দিষ্ট পয়েন্টে ক্লিক করে।',
  },
  'keyboard.type_text': {
    name: 'টেক্সট টাইপ',
    description: 'ফোকাসড চ্যাট বক্সে (বা পিক করা সিলেক্টরে) ম্যানুয়াল/লাইব্রেরি থেকে টাইপ করে',
    tooltip: 'অক্ষর ধরে টাইপ করে (ম্যানুয়াল বা Story Title লাইব্রেরি + প্রম্পট টেমপ্লেট)।',
    howto: [
      'ফোকাসড বক্সে (বা পিক করা সিলেক্টরে) টেক্সট টাইপ করে।',
      'Manual text বা Text library (যেমন Story Title) বেছে নিন।',
      'Prompt template-এ পুরো বাক্য লিখে {_Story Title} ইনসার্ট করুন ({_ টাইপ করলে লাইব্রেরি বেছে নিতে পারবেন)।',
      'একাধিক টাইটেল সিলেক্ট থাকলে প্রতি লুপে পরের টাইটেল টেমপ্লেটে বসে।',
      'ChatGPT-স্টাইল এডিটরে human-like টাইপিং স্পিড ব্যবহার করুন।',
    ],
  },
  'keyboard.paste_text': {
    name: 'টেক্সট পেস্ট',
    description: 'Type Text এর মতো (ম্যানুয়াল/লাইব্রেরি/{_template}), কিন্তু পুরো টেক্সট একসাথে পেস্ট করে',
    tooltip: 'পুরো প্রম্পট একসাথে পেস্ট করে। Type Text এর মতো লাইব্রেরি ও {_Story Title} টেমপ্লেট।',
    howto: [
      'Type Text এর মতো ফিচার (ম্যানুয়াল, লাইব্রেরি, {_Story Title} টেমপ্লেট, কিউ)।',
      'অক্ষর ধরে টাইপ না করে পুরো প্রম্পট তাড়াতাড়ি পেস্ট করে।',
      'লম্বা প্রম্পটের জন্য দ্রুত - human-like টাইপিং লাগলে না।',
      'New chat / ফোকাসের পরে কানেক্ট করুন, তারপর সাধারণত Click Send।',
    ],
  },
  'keyboard.press_key': {
    name: 'কী চাপুন',
    description: 'একটি কী চাপে',
    tooltip: 'একটি কীবোর্ড কী পাঠায় (যেমন Enter)।',
  },
  'keyboard.shortcut': {
    name: 'শর্টকাট কী',
    description: 'কী কম্বিনেশন চাপে',
    tooltip: 'যেমন Control+Enter।',
  },
  'keyboard.paste': {
    name: 'পেস্ট',
    description: 'ক্লিপবোর্ড এলিমেন্টে পেস্ট করে',
    tooltip: 'ক্লিপবোর্ডের টেক্সট পেস্ট করে।',
  },
  'keyboard.select_all': {
    name: 'সব সিলেক্ট',
    description: 'এলিমেন্টের সব টেক্সট সিলেক্ট করে',
    tooltip: 'Ctrl+A এর মতো সব সিলেক্ট করে।',
  },
  'input.fill': {
    name: 'ইনপুট ফিল',
    description: 'ইনপুট ফিল্ডে ভ্যালু ভরে',
    tooltip: 'ইনপুট বক্সে টেক্সট বসায়।',
  },
  'input.clear': {
    name: 'ইনপুট খালি',
    description: 'ইনপুট ভ্যালু মুছে ফেলে',
    tooltip: 'ইনপুট খালি করে।',
  },
  'input.append': {
    name: 'টেক্সট যোগ',
    description: 'ইনপুটের শেষে টেক্সট যোগ করে',
    tooltip: 'আগের টেক্সট রেখে নতুন টেক্সট যোগ করে।',
  },
  'input.checkbox': {
    name: 'চেকবক্স',
    description: 'চেকবক্স চেক/আনচেক করে',
    tooltip: 'চেকবক্স চালু বা বন্ধ করে।',
  },
  'input.dropdown': {
    name: 'ড্রপডাউন',
    description: 'ড্রপডাউন অপশন সিলেক্ট করে',
    tooltip: 'ড্রপডাউন থেকে অপশন বেছে নেয়।',
  },
  'element.wait_visible': {
    name: 'দেখা যাওয়া পর্যন্ত ওয়েট',
    description: 'পিক করা এলিমেন্ট/আইকন স্ক্রিনে দেখা যাওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'পিক করা এলিমেন্ট/আইকন আসা পর্যন্ত অপেক্ষা।',
    howto: [
      'পিক করা এলিমেন্ট বা আইকন স্ক্রিনে দেখা যাওয়া পর্যন্ত অপেক্ষা করে।',
      'টার্গেট এলিমেন্টে Pick with mouse ব্যবহার করুন।',
    ],
  },
  'element.if_visible': {
    name: 'এলিমেন্ট দেখা গেলে',
    description: 'পিক করা বাটন/এলিমেন্ট দেখা গেলে → true পথ, নাহলে → false পথ',
    tooltip: 'এলিমেন্ট দেখা গেলে true পথ; নাহলে false পথ।',
    howto: [
      'পিক করা বাটন/এলিমেন্ট দেখা যায় কিনা চেক করে (না থাকলে ফেল করে না)।',
      'সবুজ true হ্যান্ডল → দেখা গেলে যে পথে যাবে (সাধারণত সেই বাটনে ক্লিক)।',
      'লাল false হ্যান্ডল → না দেখা গেলে অন্য পথ।',
      'পছন্দের বাটন মাউস দিয়ে পিক করুন; false-পথে অন্য বাটনের Click রাখুন।',
    ],
  },
  'element.wait_hidden': {
    name: 'লুকানো পর্যন্ত ওয়েট',
    description: 'এলিমেন্ট সরানো বা অদৃশ্য হওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'পিক করা এলিমেন্ট উধাও হওয়া পর্যন্ত অপেক্ষা।',
    howto: ['পিক করা এলিমেন্ট লুকানো বা সরানো পর্যন্ত অপেক্ষা করে।'],
  },
  'element.wait_clickable': {
    name: 'ক্লিকযোগ্য পর্যন্ত ওয়েট',
    description: 'এলিমেন্ট দেখা যায় ও ক্লিকযোগ্য হওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'ক্লিক করা যায় এমন হওয়া পর্যন্ত অপেক্ষা।',
  },
  'element.wait_text': {
    name: 'টেক্সটের জন্য ওয়েট',
    description: 'পেজ/উইন্ডোতে টেক্সট আসা পর্যন্ত অপেক্ষা করে',
    tooltip: 'পেজে কোথাও টেক্সট আসা পর্যন্ত অপেক্ষা।',
    howto: [
      'পেজ উইন্ডোতে দেওয়া টেক্সট আসা পর্যন্ত অপেক্ষা করে।',
      'Contains, Exact, বা Regex ম্যাচ মোড বেছে নিন।',
    ],
  },
  'element.wait_exact_text': {
    name: 'এক্স্যাক্ট টেক্সট ওয়েট',
    description: 'এক্স্যাক্ট লাইন/ফ্রেজ উইন্ডোতে আসা পর্যন্ত অপেক্ষা করে',
    tooltip: 'পুরো মিল থাকা টেক্সট আসা পর্যন্ত অপেক্ষা।',
  },
  'element.wait_text_gone': {
    name: 'টেক্সট যাওয়া পর্যন্ত ওয়েট',
    description: 'পেজ থেকে টেক্সট উধাও হওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'টেক্সট চলে যাওয়া পর্যন্ত অপেক্ষা।',
  },
  'element.wait_button': {
    name: 'বাটনের জন্য ওয়েট',
    description: 'লেবেল টেক্সট বা পিক করা সিলেক্টর দিয়ে বাটন আসা পর্যন্ত অপেক্ষা করে',
    tooltip: 'বাটন রেডি হওয়া পর্যন্ত অপেক্ষা (লেবেল বা পিক)।',
    howto: ['লেবেল (Send, Continue…) বা পিক করা সিলেক্টর দিয়ে বাটনের জন্য অপেক্ষা করে।'],
  },
  'element.wait_icon': {
    name: 'আইকন/ইমেজ ওয়েট',
    description: 'পিক করা আইকন/ইমেজ/SVG দেখা যাওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'আইকন বা ইমেজ আসা পর্যন্ত অপেক্ষা।',
  },
  'element.find': {
    name: 'এলিমেন্ট খুঁজুন',
    description: 'এলিমেন্ট আছে কিনা চেক করে',
    tooltip: 'এলিমেন্ট খুঁজে পাওয়া যায় কিনা নিশ্চিত করে।',
  },
  'element.extract_text': {
    name: 'টেক্সট এক্সট্রাক্ট',
    description: 'এলিমেন্ট থেকে টেক্সট পড়ে',
    tooltip: 'এলিমেন্টের টেক্সট ভ্যারিয়েবলে সেভ করে।',
  },
  'element.extract_attribute': {
    name: 'অ্যাট্রিবিউট এক্সট্রাক্ট',
    description: 'অ্যাট্রিবিউট ভ্যালু পড়ে',
    tooltip: 'যেমন href অ্যাট্রিবিউট পড়ে।',
  },
  'element.highlight': {
    name: 'এলিমেন্ট হাইলাইট',
    description: 'ম্যাচ করা এলিমেন্ট সাময়িক হাইলাইট করে',
    tooltip: 'টেস্টের জন্য এলিমেন্ট চিহ্নিত করে দেখায়।',
  },
  'variables.set': {
    name: 'ভ্যারিয়েবল সেট',
    description: 'ওয়ার্কফ্লো ভ্যারিয়েবল সেট করে',
    tooltip: 'নাম ও ভ্যালু দিয়ে ভ্যারিয়েবল তৈরি/আপডেট করে।',
  },
  'variables.delete': {
    name: 'ভ্যারিয়েবল ডিলিট',
    description: 'ভ্যারিয়েবল মুছে ফেলে',
    tooltip: 'ভ্যারিয়েবল সরিয়ে দেয়।',
  },
  'variables.append': {
    name: 'ভ্যারিয়েবলে যোগ',
    description: 'আগের ভ্যারিয়েবলের সাথে টেক্সট যোগ করে (পার্ট জোড়ার জন্য)',
    tooltip: 'ভ্যারিয়েবলের শেষে টেক্সট জুড়ে দেয়।',
  },
  'conditions.if': {
    name: 'ইফ',
    description: 'If/else ব্রাঞ্চ: এলিমেন্ট ভিজিবল, বাটন নাম, পেজ টেক্সট, বা ভ্যারিয়েবল - ওয়েট + মাউস পিক সহ',
    tooltip: 'বাটন, টেক্সট, এলিমেন্ট বা ভ্যারিয়েবল দিয়ে if/else - মাউস পিক ও ওয়েট সহ।',
    howto: [
      'Properties খুলে “Check what?” বেছে নিন - এলিমেন্ট ভিজিবল, বাটন নাম, পেজ টেক্সট, বা ভ্যারিয়েবল।',
      'এলিমেন্টের জন্য Pick with mouse, বা Continue / Send এর মতো বাটন লেবেল টাইপ করুন।',
      'Wait before = আগে অপেক্ষা; Check window = কতক্ষণ খুঁজবে।',
      'সবুজ true ও লাল false আলাদা পরের স্টেপে কানেক্ট করুন।',
    ],
  },
  'conditions.switch': {
    name: 'সুইচ',
    description: 'ভ্যারিয়েবল, পিক করা এলিমেন্ট টেক্সট, বা অ্যাট্রিবিউট দিয়ে মাল্টি-ওয়ে ব্রাঞ্চ',
    tooltip: 'ভ্যারিয়েবল বা এলিমেন্ট টেক্সট দিয়ে একাধিক কেস + ডিফল্ট।',
    howto: [
      'ভ্যালু ভ্যারিয়েবল থেকে নিন, বা এলিমেন্ট পিক করে তার টেক্সট/অ্যাট্রিবিউট পড়ুন।',
      'কেস কমা দিয়ে লিখুন (Continue,Retry,Cancel) - প্রতিটি আলাদা ব্রাঞ্চ হ্যান্ডল হয়।',
      'মিল না হলে default হ্যান্ডলে যায়।',
      'Wait before / Check window If এর মতো কাজ করে।',
    ],
  },
  'loops.for': {
    name: 'ফর লুপ',
    description: 'N বার রিপিট করে',
    tooltip: 'নির্দিষ্ট সংখ্যকবার লুপ চালায়।',
  },
  'loops.while': {
    name: 'হোয়াইল লুপ',
    description: 'কন্ডিশন সত্য থাকলে লুপ চালায়',
    tooltip: 'শর্ত মিথ্যা না হওয়া পর্যন্ত লুপ।',
  },
  'loops.foreach': {
    name: 'ফরইচ',
    description: 'অ্যারে ভ্যারিয়েবলের উপর লুপ করে',
    tooltip: 'লিস্টের প্রতিটি আইটেমে একবার করে চালায়।',
  },
  'loops.break': {
    name: 'ব্রেক',
    description: 'বর্তমান লুপ থেকে বের হয়',
    tooltip: 'লুপ থামিয়ে পরের ধাপে যায়।',
  },
  'loops.continue': {
    name: 'কন্টিনিউ',
    description: 'লুপের পরের ইটারেশনে যায়',
    tooltip: 'বর্তমান ইটারেশন স্কিপ করে পরেরটিতে যায়।',
  },
  'wait.delay': {
    name: 'ফিক্সড ডিলে',
    description: 'নির্দিষ্ট মিলিসেকেন্ড অপেক্ষা করে',
    tooltip: 'নির্দিষ্ট সময় থামে।',
  },
  'wait.random': {
    name: 'র‍্যান্ডম ডিলে',
    description: 'র‍্যান্ডম সময় অপেক্ষা করে',
    tooltip: 'মিন–ম্যাক্সের মধ্যে এলোমেলো অপেক্ষা।',
  },
  'wait.until_url': {
    name: 'URL পর্যন্ত ওয়েট',
    description: 'URL-এ নির্দিষ্ট টেক্সট থাকা পর্যন্ত অপেক্ষা করে',
    tooltip: 'অ্যাড্রেস বারে টেক্সট মিল না হওয়া পর্যন্ত অপেক্ষা।',
  },
  'wait.until_element': {
    name: 'এলিমেন্ট পর্যন্ত ওয়েট',
    description: 'পিক করা এলিমেন্ট দেখা যাওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'এলিমেন্ট ভিজিবল হওয়া পর্যন্ত অপেক্ষা।',
  },
  'wait.until_hidden': {
    name: 'লুকানো পর্যন্ত ওয়েট',
    description: 'পিক করা এলিমেন্ট লুকানো/সরানো পর্যন্ত অপেক্ষা করে',
    tooltip: 'এলিমেন্ট উধাও হওয়া পর্যন্ত অপেক্ষা।',
  },
  'wait.until_text': {
    name: 'টেক্সট পর্যন্ত ওয়েট',
    description: 'উইন্ডোতে কোথাও টেক্সটের জন্য অপেক্ষা করে',
    tooltip: 'পেজে টেক্সট আসা পর্যন্ত অপেক্ষা।',
  },
  'wait.until_button': {
    name: 'বাটন পর্যন্ত ওয়েট',
    description: 'লেবেল বা সিলেক্টর দিয়ে বাটনের জন্য অপেক্ষা করে',
    tooltip: 'বাটন রেডি হওয়া পর্যন্ত অপেক্ষা।',
  },
  'wait.until_clickable': {
    name: 'ক্লিকযোগ্য পর্যন্ত ওয়েট',
    description: 'এলিমেন্ট ক্লিক করা যায় এমন হওয়া পর্যন্ত অপেক্ষা করে',
    tooltip: 'ক্লিকযোগ্য হওয়া পর্যন্ত অপেক্ষা।',
  },
  'ai.open_chatgpt': {
    name: 'ChatGPT খুলুন',
    description: 'ChatGPT খোলে - আগে খোলা থাকলে সেই ট্যাব রিইউজ করে',
    tooltip: 'ChatGPT খোলে, বা আগের ChatGPT ট্যাব ফোকাস করে।',
    howto: [
      'ChatGPT খোলে, বা ট্যাব আগেই খোলা থাকলে ফোকাস করে।',
      'Start এর পরে কানেক্ট করুন, তারপর সাধারণত Wait For Page।',
      'কোডিং লাগে না - সবুজ ডট দিয়ে ক্রমে কানেক্ট করুন।',
    ],
  },
  'ai.open_claude': {
    name: 'Claude খুলুন',
    description: 'Claude ওয়েব অ্যাপ খোলে',
    tooltip: 'Claude.ai খোলে।',
  },
  'ai.open_gemini': {
    name: 'Gemini খুলুন',
    description: 'Gemini ওয়েব অ্যাপ খোলে',
    tooltip: 'Google Gemini খোলে।',
  },
  'ai.open_grok': {
    name: 'Grok খুলুন',
    description: 'Grok ওয়েব অ্যাপ খোলে',
    tooltip: 'Grok খোলে।',
  },
  'ai.paste_prompt': {
    name: 'প্রম্পট পেস্ট',
    description: 'AI কম্পোজারে প্রম্পট পেস্ট করে',
    tooltip: 'চ্যাট বক্সে প্রম্পট পেস্ট করে।',
  },
  'ai.click_send': {
    name: 'সেন্ড ক্লিক',
    description: 'AI সেন্ড বাটনে ক্লিক করে',
    tooltip: 'চ্যাটের Send বাটনে ক্লিক করে।',
    howto: [
      'টেক্সট টাইপের পরে Send বাটনে ক্লিক করে।',
      'ডিফল্ট সিলেক্টর ফেল করলে মাউস দিয়ে Send বাটন পিক করুন।',
    ],
  },
  'ai.wait_response': {
    name: 'রেসপন্স ওয়েট',
    description: 'ChatGPT জেনারেট শেষ হওয়া পর্যন্ত অপেক্ষা করে (Stop বাটন চলে যায়)',
    tooltip: 'ChatGPT উত্তর শেষ করা পর্যন্ত অপেক্ষা করে।',
    howto: [
      'AI জেনারেট শেষ হওয়া পর্যন্ত অপেক্ষা করে (Stop বাটন উধাও)।',
      'Send এর পরে, Collect JSON Parts বা Repeat If More Titles এর আগে রাখুন।',
    ],
  },
  'ai.copy_response': {
    name: 'রেসপন্স কপি',
    description: 'AI রেসপন্স টেক্সট ভ্যারিয়েবলে নেয়',
    tooltip: 'উত্তরের টেক্সট ভ্যারিয়েবলে সেভ করে।',
  },
  'ai.collect_json_parts': {
    name: 'JSON পার্ট সংগ্রহ',
    description:
      'ChatGPT OUTPUT_LIMIT_REACHED / success:false দিলে পার্ট সংখ্যা জিজ্ঞেস করে, Part 1…N সংগ্রহ করে, জোড়া JSON ডাউনলোড করে',
    tooltip:
      'লম্বা JSON স্টোরি: কয়টা পার্ট জিজ্ঞেস করে, প্রতিটি সংগ্রহ করে, এডিট ছাড়া জোড়ে, .json সেভ করে।',
    howto: [
      'Wait Response এর পরে রাখুন।',
      'ChatGPT সম্পূর্ণ JSON স্টোরি দিলে সেই ফাইল ডাউনলোড করে।',
      'OUTPUT_LIMIT_REACHED / success:false দিলে কয়টা পার্ট লাগবে জিজ্ঞেস করে।',
      'তারপর Part 1…N চায়, প্রতিটি কপি করে, এডিট ছাড়া জোড়ে, পুরো JSON ডাউনলোড করে।',
      'প্রতি ধাপে জেনারেট শেষ হওয়া পর্যন্ত অপেক্ষা - লম্বা স্টোরিতে বড় টাইমআউট লাগে।',
    ],
  },
  'ai.chatgpt_prompt': {
    name: 'ChatGPT প্রম্পট (মডিউল)',
    description: 'ফুল ChatGPT মডিউল: খোলা, টাইপ, সেন্ড, এক্সট্রাক্ট',
    tooltip: 'এক ধাপে ChatGPT ফ্লো চালায়।',
  },
  'flow.start': {
    name: 'স্টার্ট',
    description: 'ওয়ার্কফ্লো শুরুর পয়েন্ট',
    tooltip: 'ওয়ার্কফ্লোর শুরু।',
    howto: [
      'প্রতিটি ওয়ার্কফ্লো Start দিয়ে শুরু হওয়া উচিত।',
      'Start এর ডান সবুজ ডট প্রথম আসল অ্যাকশনে কানেক্ট করুন।',
    ],
  },
  'flow.end': {
    name: 'এন্ড',
    description: 'ওয়ার্কফ্লো শেষ করে',
    tooltip: 'ওয়ার্কফ্লো শেষ।',
    howto: [
      'ওয়ার্কফ্লোর শেষ চিহ্নিত করে।',
      'শেষ অ্যাকশনের ডান সবুজ ডট End এ কানেক্ট করুন।',
    ],
  },
  'flow.stop': {
    name: 'স্টপ',
    description: 'এক্সিকিউশন সাথে সাথে থামায়',
    tooltip: 'রান এখনই বন্ধ করে।',
  },
  'flow.pause': {
    name: 'পজ',
    description: 'পজ করে রিজিউমের অপেক্ষা করে',
    tooltip: 'ম্যানুয়ালি চালু না করা পর্যন্ত থামে।',
  },
  'flow.goto_step': {
    name: 'স্টেপে যান',
    description: 'লিস্ট থেকে বেছে নেওয়া অন্য স্টেপে জাম্প করে',
    tooltip: 'ড্রপডাউন থেকে অন্য স্টেপে জাম্প - আইডি টাইপ লাগে না।',
    howto: [
      'ড্রপডাউন থেকে বেছে নেওয়া স্টেপে জাম্প করে।',
      'কাস্টম লুপ বা এগিয়ে যাওয়ার জন্য কাজে লাগে।',
    ],
  },
  'flow.repeat_if_more': {
    name: 'আরো টাইটেল থাকলে রিপিট',
    description: 'লাইব্রেরি থেকে TypeText এর পর: আরো টাইটেল থাকলে পেছনে জাম্প (যেমন New chat)',
    tooltip:
      'আরো Story Title থাকলে New chat এ ফিরে পরেরটা টাইপ করে। ড্রপডাউন থেকে স্টেপ বেছে নিন।',
    howto: [
      'টেক্সট লাইব্রেরিতে একাধিক টাইটেল থাকলে TypeText এর পরে ব্যবহার করুন।',
      'Properties-এ কোন স্টেপে ফিরবেন বেছে নিন (সাধারণত “Click · New chat”)।',
      'নোড আইডি টাইপ লাগে না - ড্রপডাউন ব্যবহার করুন।',
      'আরো টাইটেল থাকলে ফিরে যায়; না থাকলে End পর্যন্ত চলতে থাকে।',
    ],
  },
  'flow.goto_workflow': {
    name: 'ওয়ার্কফ্লোতে যান',
    description: 'নেস্টেড / সাব ওয়ার্কফ্লো চালায়',
    tooltip: 'অন্য ওয়ার্কফ্লো চালু করে।',
  },
  'flow.next_plan_execute': {
    name: 'নেক্সট প্ল্যান এক্সিকিউট',
    description:
      'একই ওয়ার্কফ্লোর অন্য প্ল্যানে এক্সিকিউশন হ্যান্ডঅফ করে। লিস্ট অর্ডার ম্যাটার করে না - শুধু সিলেক্ট করা প্ল্যান চলে।',
    tooltip:
      'এই স্টেপের পর একই ওয়ার্কফ্লোর অন্য প্ল্যান শুরু করে। ড্রপডাউন থেকে টার্গেট প্ল্যান বেছে নিন।',
    howto: [
      'একই ওয়ার্কফ্লোর অন্য প্ল্যানে রান হস্তান্তর করে।',
      'Properties-এ Target plan ড্রপডাউন থেকে বেছে নিন (শুধু একই ওয়ার্কফ্লো)।',
      'প্ল্যান লিস্টের অর্ডার ম্যাটার করে না - আপনার সিলেক্ট করা প্ল্যানই পরেরটা।',
      'প্ল্যান চেইন করা যায় (A → C → D)। সিলেক্ট না করা প্ল্যান অটো-রান হয় না।',
    ],
  },
  'flow.return': {
    name: 'রিটার্ন',
    description: 'নেস্টেড ওয়ার্কফ্লো থেকে ফিরে আসে',
    tooltip: 'সাব-ওয়ার্কফ্লো শেষ করে ফিরে আসে।',
  },
  'logging.info': {
    name: 'লগ ইনফো',
    description: 'ইনফো লগ লেখে',
    tooltip: 'অ্যাক্টিভিটিতে ইনফো মেসেজ লগ করে।',
  },
  'logging.error': {
    name: 'লগ এরর',
    description: 'এরর লগ লেখে',
    tooltip: 'অ্যাক্টিভিটিতে এরর মেসেজ লগ করে।',
  },
  'logging.success': {
    name: 'লগ সাকসেস',
    description: 'সাকসেস লগ লেখে',
    tooltip: 'অ্যাক্টিভিটিতে সাকসেস মেসেজ লগ করে।',
  },
  'data.json_parse': {
    name: 'JSON পার্স',
    description: 'JSON স্ট্রিং ভ্যারিয়েবলে পার্স করে',
    tooltip: 'JSON টেক্সট অবজেক্টে রূপান্তর করে।',
  },
  'data.regex_extract': {
    name: 'রেজেক্স এক্সট্রাক্ট',
    description: 'টেক্সট থেকে ক্যাপচার গ্রুপ ভ্যারিয়েবলে নেয় (যেমন পার্ট কাউন্ট)',
    tooltip: 'রেজেক্স দিয়ে অংশ বের করে ভ্যারিয়েবলে রাখে।',
  },
  'data.replace': {
    name: 'রিপ্লেস',
    description: 'ভ্যারিয়েবলের টেক্সট রিপ্লেস করে',
    tooltip: 'খুঁজে বদলে দেয়।',
  },
  'data.trim': {
    name: 'ট্রিম',
    description: 'অতিরিক্ত স্পেস কেটে ফেলে',
    tooltip: 'শুরু/শেষের হোয়াইটস্পেস সরায়।',
  },
  'downloads.download_url': {
    name: 'ইমেজ/ফাইল ডাউনলোড',
    description: 'URL থেকে প্রজেক্ট ফোল্ডারে ডাউনলোড করে',
    tooltip: 'লিংক থেকে ফাইল ডাউনলোড করে।',
  },
  'downloads.save_text': {
    name: 'টেক্সট ফাইল সেভ',
    description: 'টেক্সট/JSON ভ্যারিয়েবল ফাইল হিসেবে ডাউনলোড করে',
    tooltip: 'ভ্যারিয়েবলকে ফাইল করে সেভ করে।',
  },
  'clipboard.copy_event': {
    name: 'কপি ইভেন্ট',
    description:
      'এক ধাপে Copy Event: পেজের Copy বাটন পিক, ক্লিক, টেক্সট ক্যাপচার, Copy Store-এ সেভ (story-{_NumberAuto}), চাইলে JSON ফরম্যাট।',
    tooltip: 'Copy বাটন পিক → ক্লিক → story-1, story-2… সেভ · পরে {{COPY:story-1}}',
    howto: [
      'ক্যানভাসে Copy Event টেনে আনুন।',
      '“Pick Copy button” দিয়ে পেজের আসল Copy বাটনে ক্লিক করুন (ChatGPT Copy ইত্যাদি)।',
      'Source mode “Click Copy button” (ডিফল্ট): ওয়ার্কফ্লো বাটনে ক্লিক করে, ক্লিপবোর্ড পড়ে, তারপর সেভ করে।',
      'Copy name story-{_NumberAuto} (বা short-story-{_NumberAuto}) রাখুন।',
      'Format text বা JSON। Store ডিফল্টে চালু থাকে।',
      'পরের স্টেপে: {{COPY:story-1}} / {{COPY_NAME:story-1}} / {{COPY:story-1.number}}।',
    ],
  },
  'clipboard.write': {
    name: 'ক্লিপবোর্ডে লিখুন',
    description:
      'ব্রাউজার ক্লিপবোর্ডে টেক্সট কপি করে। চাইলে story-{_NumberAuto} নামে Copy Store-এ সেভ করে।',
    tooltip: 'টেক্সট কপি + অপশনাল Copy Store ({{COPY:story-1}})',
    howto: [
      'Text-এ যা কপি করতে চান সেট করুন ({{variables}} ও {{COPY:name}} সাপোর্ট)।',
      'Store in Copy Store চালু করলে এই ওয়ার্কফ্লোর পরের স্টেপে রাখা যায়।',
      'Name story-{_NumberAuto} দিলে story-1, story-2, … হয় (প্রিফিক্স আলাদা সিরিজ)।',
      'Format JSON হলে {"name","text"} কপি হয়, Store-এ প্লেইন টেক্সটই থাকে।',
      'পরে রেফারেন্স: {{COPY:story-1}}, {{COPY_NAME:story-1}}, বা {{COPY:story-1.number}}।',
    ],
  },
  'clipboard.read': {
    name: 'ক্লিপবোর্ড পড়ুন',
    description: 'ক্লিপবোর্ড ভ্যারিয়েবলে পড়ে',
    tooltip: 'ক্লিপবোর্ডের টেক্সট ভ্যারিয়েবলে নেয়।',
  },
  'screenshot.full': {
    name: 'ফুল স্ক্রিনশট',
    description: 'ভিজিবল ট্যাবের স্ক্রিনশট নেয় (মেটাডেটা লগ হয়)',
    tooltip: 'স্ক্রিনের দৃশ্যমান অংশের স্ক্রিনশট।',
  },
}

/** Common field label/help overlays (by field key). */
const FIELD_BN = {
  url: { label: 'URL' },
  active: { label: 'ট্যাব ফোকাস' },
  reuseExisting: {
    label: 'আগের ট্যাব রিইউজ',
    help: 'এই সাইটের ট্যাব আগেই খোলা থাকলে নতুন না খুলে সেটা ফোকাস করে',
  },
  selector: { label: 'সিলেক্টর', help: 'মাউস দিয়ে পিক করুন' },
  y: { label: 'স্ক্রল Y' },
  filename: { label: 'ফাইলনেম' },
  tabId: { label: 'ট্যাব আইডি' },
  urlIncludes: { label: 'URL-এ আছে' },
  action: { label: 'অ্যাকশন' },
  sourceSelector: { label: 'সোর্স' },
  targetSelector: { label: 'টার্গেট' },
  x: { label: 'X' },
  textMode: { label: 'টেক্সট সোর্স', help: 'লাইব্রেরি ম্যানেজ: Workflow Planner → Text libraries' },
  text: { label: 'টেক্সট' },
  textLibraryId: { label: 'লাইব্রেরি' },
  textItemIds: { label: 'সিলেক্টেড টাইটেল' },
  textTemplate: {
    label: 'প্রম্পট টেমপ্লেট',
    help: 'পরের লাইব্রেরি টাইটেল বসাতে {_Story Title} ব্যবহার করুন',
  },
  queueWrap: {
    label: 'কিউ চিরকাল র‍্যাপ',
    help: 'Repeat If More Titles ব্যাচ লুপের জন্য বন্ধ রাখুন',
  },
  typingSpeed: { label: 'টাইপিং স্পিড' },
  key: { label: 'কী' },
  shortcut: { label: 'শর্টকাট' },
  value: { label: 'ভ্যালু' },
  checked: { label: 'চেকড' },
  pollMs: {
    label: 'চেক উইন্ডো (ms)',
    help: 'false পথে যাওয়ার আগে কতক্ষণ খুঁজবে',
  },
  matchMode: { label: 'ম্যাচ মোড' },
  buttonText: { label: 'বাটন লেবেল' },
  exact: { label: 'এক্স্যাক্ট লেবেল ম্যাচ' },
  outputKey: { label: 'ভ্যারিয়েবল হিসেবে সেভ' },
  attribute: { label: 'অ্যাট্রিবিউট' },
  checkType: { label: 'কী চেক করবে' },
  waitBeforeMs: { label: 'আগে ওয়েট (ms)' },
  waitMs: { label: 'চেক উইন্ডো (ms)' },
  buttonName: { label: 'বাটন নাম' },
  left: { label: 'বাম ভ্যালু' },
  operator: { label: 'অপারেটর' },
  right: { label: 'ডান ভ্যালু' },
  negate: { label: 'ইনভার্ট' },
  sourceType: { label: 'ভ্যালু কোথা থেকে' },
  cases: {
    label: 'কেস (কমা দিয়ে)',
    help: 'প্রতিটি কেস একটি ব্রাঞ্চ; মিল না হলে default',
  },
  count: { label: 'কাউন্ট' },
  indexVariable: { label: 'ইন্ডেক্স ভ্যারিয়েবল' },
  maxIterations: { label: 'ম্যাক্স ইটারেশন' },
  collectionKey: { label: 'কালেকশন ভ্যারিয়েবল' },
  itemVariable: { label: 'আইটেম ভ্যারিয়েবল' },
  ms: { label: 'মিলিসেকেন্ড' },
  minMs: { label: 'মিন ms' },
  maxMs: { label: 'ম্যাক্স ms' },
  includes: { label: 'URL-এ আছে' },
  prompt: { label: 'প্রম্পট' },
  maxParts: { label: 'ম্যাক্স পার্ট', help: 'সেফটি ক্যাপ (২–২০)' },
  autoDownload: { label: 'জোড়া JSON অটো-ডাউনলোড' },
  targetNodeId: { label: 'যে স্টেপে জাম্প', help: 'ক্যানভাসের স্টেপ বেছে নিন' },
  workflowId: { label: 'টার্গেট প্ল্যান' },
  message: { label: 'মেসেজ' },
  source: { label: 'সোর্স' },
  pattern: { label: 'রেজেক্স প্যাটার্ন' },
  group: { label: 'ক্যাপচার গ্রুপ' },
  search: { label: 'সার্চ' },
  replaceWith: { label: 'দিয়ে বদলান' },
  projectName: { label: 'প্রজেক্ট' },
  sourceMode: {
    label: 'সোর্স মোড',
    help: 'ডিফল্ট: পেজের Copy বাটন পিক; রানটাইমে ক্লিক করে ক্লিপবোর্ড ক্যাপচার',
  },
  clickDelayMs: {
    label: 'ক্লিকের পর ওয়েট (ms)',
    help: 'Copy ক্লিকের পর ক্লিপবোর্ড পড়ার আগে ডিলে',
  },
  copy: { label: 'ক্লিপবোর্ডে রাখুন/লিখুন' },
  store: {
    label: 'Copy Store-এ সেভ',
    help: 'এই ওয়ার্কফ্লোর Copy Store-এ সেভ (চালু রাখা ভালো)',
  },
  name: { label: 'কপি নাম', help: '{_NumberAuto} সাপোর্ট। প্রিফিক্স আলাদা সিরিজ (story vs short-story)।' },
  format: { label: 'ফরম্যাট' },
  label: { label: 'লেবেল' },
  separator: {
    label: 'সেপারেটর',
    help: 'খালি রাখলে কোনো পরিবর্তন ছাড়া জোড়া হয় (JSON পার্টের জন্য দরকার)',
  },
}

// Per-action field overrides where shared key differs
const FIELD_BN_BY_ACTION = {
  'flow.next_plan_execute': {
    workflowId: {
      label: 'টার্গেট প্ল্যান',
      help: 'শুধু বর্তমান ওয়ার্কফ্লোর প্ল্যান দেখায়। সিলেক্ট করা প্ল্যানই পরেরটা - লিস্টের পরের আইটেম নয়।',
    },
  },
  'flow.repeat_if_more': {
    targetNodeId: {
      label: 'যে স্টেপে ফিরবে',
      help: 'সাধারণত “Click · New chat” বেছে নিন - n_new_chat টাইপ লাগে না',
    },
  },
  'flow.goto_workflow': {
    workflowId: { label: 'ওয়ার্কফ্লো আইডি' },
  },
  'clipboard.copy_event': {
    selector: {
      label: 'Copy বাটন / এলিমেন্ট সিলেক্টর',
      help: 'Pick Copy button ব্যবহার করুন - ক্লিক/এক্সট্রাক্ট মোডে দরকার',
      placeholder: 'মাউস দিয়ে Copy বাটন পিক করুন',
    },
    text: {
      label: 'টেক্সট (ম্যানুয়াল / ভ্যারিয়েবল মোড)',
      help: 'শুধু Source mode = Manual / {{variable}} হলে ব্যবহার হয়',
    },
    outputKey: {
      label: 'ভ্যারিয়েবল হিসেবেও সেভ',
      help: 'ক্যাপচার করা প্লেইন টেক্সটের অপশনাল রান ভ্যারিয়েবল',
    },
  },
  'ai.collect_json_parts': {
    filename: { label: 'ডাউনলোড ফাইলনেম', help: 'Chrome downloads দিয়ে সেভ' },
    outputKey: { label: 'JSON ভ্যারিয়েবল নাম' },
  },
  'variables.set': {
    key: { label: 'নাম' },
  },
  'variables.delete': {
    key: { label: 'নাম' },
  },
  'variables.append': {
    key: { label: 'ভ্যারিয়েবল নাম' },
    text: { label: 'যোগ করার টেক্সট / {{var}}' },
  },
  'element.wait_exact_text': {
    text: {
      label: 'এক্স্যাক্ট টেক্সট',
      help: 'পুরো লাইন বা পুরো পেজ টেক্সটের সাথে এক্স্যাক্ট মিল',
    },
  },
}

const GENERIC_HOWTO = (name) => [
  `${name} - এই অ্যাকশন ক্যানভাসে টেনে আনুন।`,
  'এক সবুজ ডট থেকে অন্য সবুজ ডটে টেনে স্টেপ কানেক্ট করুন।',
  'ক্যানভাসে স্টেপে ক্লিক করে ডানদিকে অপশন এডিট করুন।',
]

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function emitStr(s) {
  return `'${esc(s)}'`
}

const missing = Object.keys(en).filter((id) => !BN[id])
if (missing.length) {
  console.error('Missing BN for', missing)
  process.exit(1)
}

let out = `import type { ActionLocaleEntry } from '@/shared/i18n/action-locale-types'\n\n`
out += `/** Bangla strings for every planner action (name, description, tip, howto, fields). */\n`
out += `export const ACTION_BN: Record<string, ActionLocaleEntry> = {\n`

for (const id of Object.keys(en).sort()) {
  const e = en[id]
  const b = BN[id]
  const tooltip = b.tooltip || b.description
  const howto = b.howto?.length
    ? b.howto
    : GENERIC_HOWTO(b.name)

  // fields: merge shared + per-action for keys present in EN
  const fields = {}
  const enFields = e.fields || {}
  const byAct = FIELD_BN_BY_ACTION[id] || {}
  for (const key of Object.keys(enFields)) {
    const merged = {
      ...(FIELD_BN[key] || {}),
      ...(byAct[key] || {}),
    }
    if (Object.keys(merged).length) fields[key] = merged
  }
  // also include byAct-only keys
  for (const key of Object.keys(byAct)) {
    if (!fields[key]) fields[key] = byAct[key]
  }

  out += `  ${emitStr(id)}: {\n`
  out += `    name: ${emitStr(b.name)},\n`
  out += `    description: ${emitStr(b.description)},\n`
  out += `    tooltip: ${emitStr(tooltip)},\n`
  out += `    howto: [\n`
  for (const h of howto) out += `      ${emitStr(h)},\n`
  out += `    ],\n`
  if (Object.keys(fields).length) {
    out += `    fields: {\n`
    for (const [fk, fv] of Object.entries(fields)) {
      out += `      ${emitStr(fk)}: {\n`
      if (fv.label) out += `        label: ${emitStr(fv.label)},\n`
      if (fv.help) out += `        help: ${emitStr(fv.help)},\n`
      if (fv.placeholder) out += `        placeholder: ${emitStr(fv.placeholder)},\n`
      out += `      },\n`
    }
    out += `    },\n`
  }
  out += `  },\n`
}

out += `}\n`

fs.writeFileSync('src/shared/i18n/actions-bn.ts', out)
console.log('Wrote actions-bn.ts for', Object.keys(en).length, 'actions')
