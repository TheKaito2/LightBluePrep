/**
 * "Report a problem / send feedback" dialog.
 *
 * One <FeedbackHost /> lives in App and listens for openFeedback(), so any
 * screen can open it without threading props through. Messages go to the
 * Worker anonymously: no name, no email, no account.
 */
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import * as fb from '../lib/feedback'
import { useFocusTrap } from '../lib/useFocusTrap'

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
  const box = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

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

  const isOpen = ctx !== null
  useFocusTrap(dialog, isOpen)
  useEffect(() => {
    if (!isOpen) return
    // Back to whatever opened the dialog when it closes.
    const opener = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [isOpen])

  if (!ctx || !fb.available) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || !ctx) return
    setPhase('sending'); setError(null)
    try {
      await fb.send(kind, message, ctx, website)
      setPhase('sent')
    } catch (err) {
      setError((err as Error).message); setPhase('edit')
    }
  }

  return (
    <>
      <div className="fb-scrim" onClick={() => setCtx(null)} />
      <div ref={dialog} className="fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div className="fb-head">
          <h2 id="fb-title" className="fb-title">
            {phase === 'sent' ? 'Thanks!' : 'Send feedback'}
          </h2>
          <button className="sheet-x fb-x" onClick={() => setCtx(null)} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {phase === 'sent' ? (
          <div className="fb-body">
            <p className="fb-p">Got it. Every message gets read, and bugs get fixed as fast as I can.</p>
            <button className="btn primary" onClick={() => setCtx(null)}>Close</button>
          </div>
        ) : (
          <form className="fb-body" onSubmit={submit}>
            <div className="seg fb-kind" role="group" aria-label="Type">
              {(['bug', 'comment'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k}
                        className={kind === k ? 'seg-b on' : 'seg-b'}
                        onClick={() => setKind(k)}>
                  {k === 'bug' ? 'Report a bug' : 'Comment or idea'}
                </button>
              ))}
            </div>

            {ctx.cb_id ? (
              <p className="fb-attach">About question <code>{ctx.cb_id}</code></p>
            ) : null}

            <textarea ref={box} className="fb-text" rows={5} maxLength={fb.MAX_CHARS}
                      value={message} onChange={(e) => setMessage(e.target.value)}
                      placeholder={kind === 'bug'
                        ? 'What went wrong? e.g. wrong answer key, broken image, button not working…'
                        : 'What would make LightBluePrep better?'} />
            {/* Honeypot: hidden from people, filled by bots. */}
            <input className="fb-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
                   value={website} onChange={(e) => setWebsite(e.target.value)} name="fax_ref" />

            <div className="fb-foot">
              <span className="fb-note">
                Anonymous. No name or email is sent. {message.length}/{fb.MAX_CHARS}
              </span>
              <button className="btn primary" type="submit"
                      disabled={!message.trim() || phase === 'sending'}>
                {phase === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
            {error ? <p className="fb-err">{error}</p> : null}
          </form>
        )}
      </div>
    </>
  )
}
