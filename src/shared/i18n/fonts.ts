/**
 * Locale-aware font loading.
 * English keeps the lean Latin stack; Bangla lazily loads Anek Bangla (variable).
 */

const ANEK_STYLESHEET_ID = 'ae-font-anek-bangla'

/** Variable weight range only (UI uses 400–700) — smaller than full 100–800. */
export const ANEK_BANGLA_CSS =
  'https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400..700&display=swap'

let banglaFontsRequested = false

function ensureFontPreconnect() {
  if (document.querySelector('link[data-ae-fonts-preconnect="gstatic"]')) return
  const pre = document.createElement('link')
  pre.rel = 'preconnect'
  pre.href = 'https://fonts.gstatic.com'
  pre.crossOrigin = 'anonymous'
  pre.dataset.aeFontsPreconnect = 'gstatic'
  document.head.appendChild(pre)
}

/** Load Anek Bangla once; safe to call repeatedly. */
export function loadBanglaFonts(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(ANEK_STYLESHEET_ID)) {
    banglaFontsRequested = true
    return
  }
  ensureFontPreconnect()
  const link = document.createElement('link')
  link.id = ANEK_STYLESHEET_ID
  link.rel = 'stylesheet'
  link.href = ANEK_BANGLA_CSS
  link.media = 'print'
  link.onload = () => {
    link.media = 'all'
  }
  document.head.appendChild(link)
  // Fallback if onload is skipped
  window.setTimeout(() => {
    if (link.media !== 'all') link.media = 'all'
  }, 1200)
  banglaFontsRequested = true
}

export function applyDocumentLocale(locale: 'en' | 'bn') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.lang = locale === 'bn' ? 'bn' : 'en'
  root.dataset.locale = locale
  if (locale === 'bn') loadBanglaFonts()
}

export function banglaFontsLoaded(): boolean {
  return banglaFontsRequested
}
