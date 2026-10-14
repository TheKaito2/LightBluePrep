/**
 * "Report a problem / send feedback" dialog.
 *
 * One <FeedbackHost /> lives in App and listens for openFeedback(), so any
 * screen can open it without threading props through. Messages go to the
 * Worker anonymously: no name, no email, no account.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { Modal } from './Modal'
import * as fb from '../lib/feedback'
import { toUserMessage } from '../lib/errors'

const EVENT = 'lbp:feedback'

export function openFeedback(ctx: fb.FeedbackContext & { kind?: fb.FeedbackKind } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: ctx }))
}

/** A plain text link that opens the dialog. Renders nothing without a sync API. */
export function FeedbackLink({ label, ctx, className = 'fb-link' }: {
  label: string
  ctx?: fb.FeedbackContext & { kind?: fb.FeedbackKind }
  className?: string
}) {
  if (!fb.available) return null
  return (
    <button type="button" className={className} onClick={() => openFeedback(ctx)}>
      {label}
    </button>
  )
}

type Phase = 'edit' | 'sending' | 'sent'

export function FeedbackHost() {
  const [ctx, setCtx] = useState<(fb.FeedbackContext & { kind?: fb.FeedbackKind }) | null>(null)
  const [kind, setKind] = useState<fb.FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [phase, setPhase] = useState<Phase>('edit')
  const [error, setError] = useState<string | null>(null)
  const close = useCallback(() => setCtx(null), [])
  const ids = useId()

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {}
      setCtx(detail)
      setKind(detail.kind ?? (detail.cb_id ? 'bug' : 'comment'))
      setMessage(''); setWebsite(''); setError(null); setPhase('edit')
    }
    window.addEventListener(EVENT, onOpen)
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  if (!ctx || !fb.available) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || !ctx) return
    setPhase('sending'); setError(null)
    try {
      await fb.send(kind, message, ctx, website)
      setPhase('sent')
    } catch (err) {
      setError(toUserMessage(err, 'server')); setPhase('edit')
    }
  }

  const formId = `${ids}form`
  const footer = phase === 'sent'
    // autoFocus: Send was disabled while sending, so focus has dropped to
    // <body>. The key makes this a new button; autoFocus only acts on mount.
    ? <button key="close" type="button" className="btn primary" onClick={close} autoFocus>Close</button>
    : (
      <button key="send" className="btn primary" type="submit" form={formId}
              disabled={!message.trim() || phase === 'sending'}>
        {phase === 'sending' ? 'Sending…' : 'Send'}
      </button>
    )

  return (
    <Modal title={phase === 'sent' ? 'Thanks!' : 'Send feedback'} onClose={close} footer={footer}>
      {phase === 'sent' ? (
        <div role="status">
          <p className="fb-p">Got it. Every message gets read, and bugs get fixed as fast as I can.</p>
        </div>
      ) : (
        <form id={formId} className="fb-form" onSubmit={submit}>
          <div className="seg fb-kind" role="group" aria-label="Type">
            {(['bug', 'comment'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k}
                      className={kind === k ? 'seg-b on' : 'seg-b'}
                      onClick={() => setKind(k)}>
                {k === 'bug' ? 'Report a bug' : 'Comment or idea'}
              </button>
            ))}
          </div>

          <div className="fb-field">
            <label className="fb-label" htmlFor={`${ids}text`}>
              {kind === 'bug' ? 'What went wrong?' : 'Your idea'}
            </label>
            {ctx.cb_id ? (
              <p className="fb-attach">About question <code>{ctx.cb_id}</code></p>
            ) : null}
            {/* Focus lands in the box rather than on Close: writing is the whole point. */}
            <textarea id={`${ids}text`} className="fb-text" rows={5} maxLength={fb.MAX_CHARS} autoFocus
                      value={message} onChange={(e) => setMessage(e.target.value)}
                      aria-describedby={`${ids}note ${ids}count`}
                      placeholder={kind === 'bug'
                        ? 'e.g. wrong answer key, broken image, button not working…'
                        : 'What would make LightBluePrep better?'} />
            <div className="fb-foot">
              <span id={`${ids}note`} className="fb-note">Anonymous. No name or email is sent.</span>
              <span id={`${ids}count`} className="fb-note fb-count">
                {message.length}/{fb.MAX_CHARS}<span className="sr-only"> characters</span>
              </span>
            </div>
          </div>
          {/* Honeypot: hidden from people, filled by bots. */}
          <input className="fb-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
                 value={website} onChange={(e) => setWebsite(e.target.value)} name="fax_ref" />
          {error ? <p className="fb-err" role="alert">{error}</p> : null}
        </form>
      )}
    </Modal>
  )
}
