/**
 * "Support LightBluePrep" popup: Ko-fi, Buy Me a Coffee, and PromptPay for
 * Thai students. Same event-host pattern as Feedback.tsx, so the nav button and
 * the About page can both open it. The dialog itself is the shared Modal.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { DONATE, DONATE_ALT } from './Github'

const EVENT = 'lbp:support'
/** Path of the PromptPay QR image in public/. Unset hides the option. */
export const PROMPTPAY_QR = (import.meta.env.VITE_PROMPTPAY_QR as string | undefined) || ''
/**
 * `download` only works on a same-origin URL; on any other the browser just
 * opens the image. .env.pages sets a path in public/, so this holds there.
 */
const QR_SAVABLE = Boolean(PROMPTPAY_QR) && new URL(PROMPTPAY_QR, window.location.href).origin === window.location.origin
export const supportAvailable = Boolean(DONATE || DONATE_ALT || PROMPTPAY_QR)

export function openSupport() {
  window.dispatchEvent(new Event(EVENT))
}

export function SupportHost() {
  const [open, setOpen] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const qr = useRef<HTMLElement>(null)
  // On a phone the expanded QR lands below the sheet's fold; bring it up.
  useEffect(() => {
    if (showQr) qr.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [showQr])

  useEffect(() => {
    const onOpen = () => { setOpen(true); setShowQr(false) }
    window.addEventListener(EVENT, onOpen)
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  if (!open || !supportAvailable) return null

  return (
    <Modal title="Support LightBluePrep" onClose={close} className="sp-dialog">
      <p className="fb-p sp-lead">
        Donations only pay for the domain and hosting. Every question stays free
        for everyone, whether you chip in or not.
      </p>

      <div className="sp-options">
        {DONATE ? (
          <a className="sp-opt" href={DONATE} target="_blank" rel="noreferrer">
            <span className="sp-tile" aria-hidden="true"><Icon name="heart" size={18} strokeWidth={2} /></span>
            <span className="sp-text">
              <b>Ko-fi<span className="sr-only"> (opens in a new tab)</span></b><small>Card or PayPal</small>
            </span>
            <Icon name="external" size={16} />
          </a>
        ) : null}
        {DONATE_ALT ? (
          <a className="sp-opt" href={DONATE_ALT} target="_blank" rel="noreferrer">
            <span className="sp-tile" aria-hidden="true"><Icon name="coffee" size={18} strokeWidth={2} /></span>
            <span className="sp-text">
              <b>Buy Me a Coffee<span className="sr-only"> (opens in a new tab)</span></b><small>Pay by card</small>
            </span>
            <Icon name="external" size={16} />
          </a>
        ) : null}
        {PROMPTPAY_QR ? (
          <button type="button" className={showQr ? 'sp-opt on' : 'sp-opt'}
                  aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
            <span className="sp-tile" aria-hidden="true"><Icon name="qr" size={18} strokeWidth={2} /></span>
            <span className="sp-text">
              <b>PromptPay <span lang="th">· สำหรับคนไทย</span></b>
              <small>Scan with any Thai banking app</small>
            </span>
            <Icon name={showQr ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        ) : null}
      </div>

      {showQr && PROMPTPAY_QR ? (
        <figure className="sp-qr" ref={qr}>
          <img src={PROMPTPAY_QR} alt="PromptPay QR code for donations" width={240} height={237} />
          <figcaption lang="th">สแกนด้วยแอปธนาคารไหนก็ได้ ใส่จำนวนเงินเองได้เลย ขอบคุณครับ</figcaption>
          {/* A phone cannot scan its own screen: save the image, then open it
              from the banking app's "scan from photo". */}
          {QR_SAVABLE ? (
            <a className="btn sm sp-save" href={PROMPTPAY_QR} download="LightBluePrep-PromptPay.png">
              <Icon name="download" size={16} strokeWidth={2} />
              Save QR image
            </a>
          ) : null}
        </figure>
      ) : null}
    </Modal>
  )
}

/**
 * Support in the nav: a quiet button with a pink heart. The word hides on
 * tablets and phones, where the accessible name still says what it is.
 */
export function SupportLink() {
  if (!supportAvailable) return null
  return (
    <button type="button" className="supportlink" onClick={openSupport}
            aria-label="Support LightBluePrep"
            title="Donations pay for the domain and hosting">
      <Icon name="heart" size={18} strokeWidth={2} />
      <span className="supportlink-t">Support</span>
    </button>
  )
}
