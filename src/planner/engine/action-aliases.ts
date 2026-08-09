/**
 * Canonical action id + optional param patches for backward-compatible aliases.
 * Palette shows canonical IDs; imported plans may still use aliases.
 */
export const ACTION_ALIASES: Record<
  string,
  { canonical: string; paramDefaults?: Record<string, unknown> }
> = {
  'browser.refresh': { canonical: 'browser.reload' },
  'browser.focus_tab': { canonical: 'browser.switch_tab' },

  'mouse.click_exact': {
    canonical: 'mouse.click',
    paramDefaults: { clickMode: 'exact_text' },
  },
  'mouse.click_text': {
    canonical: 'mouse.click',
    paramDefaults: { clickMode: 'text' },
  },
  'mouse.click_aria': {
    canonical: 'mouse.click',
    paramDefaults: { clickMode: 'aria' },
  },
  'mouse.click_button': {
    canonical: 'mouse.click',
    paramDefaults: { clickMode: 'button' },
  },
  'mouse.click_link': {
    canonical: 'mouse.click',
    paramDefaults: { clickMode: 'link' },
  },

  'wait.until_element': {
    canonical: 'element.wait_visible',
  },
  'wait.until_hidden': {
    canonical: 'element.wait_hidden',
  },
  'wait.until_text': {
    canonical: 'element.wait_text',
  },
  'wait.until_button': {
    canonical: 'element.wait_button',
  },
  'wait.until_clickable': {
    canonical: 'element.wait_clickable',
  },

  'loops.foreach': {
    canonical: 'loops.map',
  },

  'keyboard.type': {
    canonical: 'keyboard.type_text',
  },
}

export function resolveActionAlias(actionId: string): {
  actionId: string
  paramDefaults: Record<string, unknown>
} {
  const mapped = ACTION_ALIASES[actionId]
  if (!mapped) return { actionId, paramDefaults: {} }
  return {
    actionId: mapped.canonical,
    paramDefaults: mapped.paramDefaults ?? {},
  }
}

/** IDs hidden from the palette (still executable via alias resolution). */
export const PALETTE_HIDDEN_ALIASES = new Set(Object.keys(ACTION_ALIASES))
