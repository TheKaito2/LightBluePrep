/**
 * "Support LightBluePrep" popup: Ko-fi, Buy Me a Coffee, and PromptPay for
 * Thai students. Same event-host pattern as Feedback.tsx, so the nav pill and
 * the About page can both open it. The dialog itself is the shared Modal.
 */
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { DONATE, DONATE_ALT } from './Github'

const EVENT = 'lbp:support'
/** Path of the PromptPay QR image in public/. Unset hides the option. */
export const PROMPTPAY_QR = (import.meta.env.VITE_PROMPTPAY_QR as string | undefined) || ''
export const supportAvailable = Boolean(DONATE || DONATE_ALT || PROMPTPAY_QR)

export function openSupport() {
  window.dispatchEvent(new Event(EVENT))
}

export function SupportHost() {
  const [open, setOpen] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const close = useCallback(() => setOpen(false), [])

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
            <span className="sp-badge sp-kofi"><Icon name="heart" size={19} strokeWidth={2} /></span>
            <span className="sp-text"><b>Ko-fi</b><small>Card or PayPal</small></span>
            <Icon name="arrow-right" size={16} />
          </a>
        ) : null}
        {DONATE_ALT ? (
          <a className="sp-opt" href={DONATE_ALT} target="_blank" rel="noreferrer">
            <span className="sp-badge sp-bmc"><Icon name="coffee" size={19} strokeWidth={2} /></span>
            <span className="sp-text"><b>Buy Me a Coffee</b><small>Pay by card</small></span>
            <Icon name="arrow-right" size={16} />
          </a>
        ) : null}
        {PROMPTPAY_QR ? (
          <button type="button" className={showQr ? 'sp-opt on' : 'sp-opt'}
                  aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
            <span className="sp-badge sp-pp"><Icon name="qr" size={19} strokeWidth={2} /></span>
            <span className="sp-text">
              <b>PromptPay <span lang="th">· สำหรับคนไทย</span></b>
              <small>Scan with any Thai banking app</small>
            </span>
            <Icon name={showQr ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        ) : null}
      </div>

      {showQr && PROMPTPAY_QR ? (
        <figure className="sp-qr">
          <img src={PROMPTPAY_QR} alt="PromptPay QR code for donations" width={240} height={237} />
          <figcaption lang="th">สแกนด้วยแอปธนาคารไหนก็ได้ ใส่จำนวนเงินเองได้เลย ขอบคุณครับ</figcaption>
        </figure>
      ) : null}
    </Modal>
  )
}

/** "Support" pill in the nav. Opens the popup rather than leaving the site. */
export function SupportLink() {
  if (!supportAvailable) return null
  return (
    <button type="button" className="supportlink" onClick={openSupport}
            title="Donations pay for the domain and hosting">
      <Icon name="heart" size={15} strokeWidth={2.2} />
      Support
    </button>
  )
}
