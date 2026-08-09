/**
 * Locale-aware font loading.
 * English keeps the lean Latin stack.
 * Bangla: Noto Sans Bengali for UI/body (legible at small sizes) + Anek Bangla for display.
 */

const BANGLA_STYLESHEET_ID = 'ae-font-bangla-ui'

/**
 * Discrete weights (better hinting than full variable axes at 12–14px).
 * Noto = body/UI; Anek = headings only.
 */
export const BANGLA_UI_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&family=Anek+Bangla:wght@500;600;700&display=swap'

/** @deprecated use BANGLA_UI_CSS */
export const ANEK_BANGLA_CSS = BANGLA_UI_CSS

let banglaFontsRequested = false

function ensureFontPreconnect() {
  if (document.querySelector('link[data-ae-fonts-preconnect="gstatic"]')) return
  const pre = document.createElement('link')
  pre.rel = 'preconnect'
  pre.href = 'https://fonts.gstatic.com'
  pre.crossOrigin = 'anonymous'
  pre.dataset.aeFontsPreconnect = 'gstatic'
  document.head.appendChild(pre)

  const fontsPre = document.createElement('link')
  fontsPre.rel = 'preconnect'
  fontsPre.href = 'https://fonts.googleapis.com'
  fontsPre.dataset.aeFontsPreconnect = 'googleapis'
  document.head.appendChild(fontsPre)
}

/** Load Bangla UI fonts once; safe to call repeatedly. */
export function loadBanglaFonts(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(BANGLA_STYLESHEET_ID)) {
    banglaFontsRequested = true
    return
  }
  // Remove legacy Anek-only stylesheet if present from an older build
  document.getElementById('ae-font-anek-bangla')?.remove()

  ensureFontPreconnect()
  const link = document.createElement('link')
  link.id = BANGLA_STYLESHEET_ID
  link.rel = 'stylesheet'
  link.href = BANGLA_UI_CSS
  link.media = 'print'
  link.onload = () => {
    link.media = 'all'
  }
  document.head.appendChild(link)
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
