/**
 * Where the site links out to. In one place so the nav, the footer, About,
 * Settings and the Support dialog never disagree on a URL.
 */

export const REPO = 'https://github.com/TheKaito2/LightBluePrep'

/** Donation page (Ko-fi or similar). Unset and the Support dialog leaves it out. */
export const DONATE = (import.meta.env.VITE_DONATE_URL as string | undefined) || ''
/** Optional second donation page, listed after the first in the Support dialog. */
export const DONATE_ALT = (import.meta.env.VITE_DONATE_ALT_URL as string | undefined) || ''
/** Path of the PromptPay QR image in public/. Unset hides the option. */
export const PROMPTPAY_QR = (import.meta.env.VITE_PROMPTPAY_QR as string | undefined) || ''
/** With none of the three set, there is no Support button or dialog at all. */
export const supportAvailable = Boolean(DONATE || DONATE_ALT || PROMPTPAY_QR)

/** What <SupportHost /> listens for, so the nav and About can both open it. */
export const SUPPORT_EVENT = 'lbp:support'

export function openSupport() {
  window.dispatchEvent(new Event(SUPPORT_EVENT))
}

/**
 * The privacy policy. Pages serves public/privacy.html at /privacy, the URL in
 * the sitemap; /privacy.html only 308s there. The Python server has no such
 * rewrite, so that build keeps the file name.
 */
export const PRIVACY_URL = import.meta.env.VITE_BACKEND === 'local' ? '/privacy' : '/privacy.html'
