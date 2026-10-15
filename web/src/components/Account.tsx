/**
 * The account badge and its panel: the only sync affordance in the app.
 *
 * It lives in the top nav. Because lib/auth.ts loads Google's script lazily,
 * someone who never opens the panel never makes a request to Google either.
 *
 * When VITE_SYNC_API is unset (the localhost build) this renders nothing at all.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import * as auth from '../lib/auth'
import * as sync from '../lib/sync'
import * as fb from '../lib/feedback'
import { toUserMessage } from '../lib/errors'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { PRIVACY_URL } from '../lib/links'

/** Short status words: the badge's name and tooltip. */
const LABEL: Record<sync.SyncStatus, string> = {
  off: 'Sign in',
  syncing: 'Syncing…',
  synced: 'Synced',
  pending: 'Retry',
}

/** The status line inside the signed-in panel, where there is room for a sentence. */
function statusLine(status: sync.SyncStatus, failed: boolean): string {
  if (status === 'pending') return failed ? "Couldn't sync. Retrying soon." : 'Waiting to sync.'
  if (status === 'off') return 'Not syncing.'
  return LABEL[status]
}

/** Below this the panel is a bottom sheet (spec 7.2's phone layout). */
const PHONE = '(max-width: 819px)'

/** Subscribes to the sync module so the dot tracks it without prop drilling. */
function useSyncStatus(): sync.SyncStatus {
  const [status, setStatus] = useState<sync.SyncStatus>(sync.getStatus())
  useEffect(() => sync.subscribe(() => setStatus(sync.getStatus())), [])
  return status
}

/**
 * True from a failed sync until one gets through. Each retry passes through
 * "syncing" and clears the error, so the latch keeps one failure from being
 * announced again on every retry.
 */
function useSyncFailed(): boolean {
  const [failed, setFailed] = useState(false)
  useEffect(() => sync.subscribe(() => {
    if (sync.getError()) setFailed(true)
    else if (sync.getStatus() !== 'syncing') setFailed(false)
  }), [])
  return failed
}

export function AccountBadge() {
  const status = useSyncStatus()
  const failed = useSyncFailed()
  /** Closed, or how it is open: anchored under the badge, or as a phone sheet. */
  const [open, setOpen] = useState<null | 'popover' | 'sheet'>(null)
  const [signedIn, setSignedIn] = useState(auth.signedIn())
  const wrap = useRef<HTMLDivElement>(null)
  const badge = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const close = useCallback(() => setOpen(null), [])

  // The popover is non-modal: no focus trap, a click outside closes it and
  // leaves focus where it landed, Escape closes it and hands focus back to the
  // badge. The sheet is a Modal, which does all of that itself.
  useEffect(() => {
    if (open !== 'popover') return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); badge.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!auth.configured) return null
  // Re-read on every render, not just at mount: a session the server ends
  // (expired, or deleted from another device) clears the token in auth.request,
  // and the panel then has to offer sign-in again instead of "Sign out".
  const isIn = signedIn && auth.signedIn()
  const shown = isIn ? status : 'off'

  return (
    <div className="acct" ref={wrap}>
      {/*
        Signed out, it says what it offers ("Sign in to sync"): a grey dot and
        "Not signed in" read as an offline indicator. Signed in, the desktop
        shows an avatar and the status dot; the phone header has room for an
        icon only, so there it is the cloud with the dot, and the name carries
        the status. The avatar is a generic figure on purpose: sign-in keeps
        only an anonymous account ID (privacy.html), so there is no name or
        photo to draw. Signed out, the name keeps the visible words so a voice
        command that reads them still finds the button.
      */}
      <button ref={badge} className={`acct-badge ${shown}${isIn ? ' in' : ''}`}
              onClick={() => setOpen((v) => (v ? null : window.matchMedia(PHONE).matches ? 'sheet' : 'popover'))}
              aria-expanded={Boolean(open)} aria-haspopup="dialog"
              aria-controls={open === 'popover' ? panelId : undefined}
              aria-label={isIn ? `Sync: ${LABEL[shown]}` : 'Sign in to sync'}
              title={`Sync: ${LABEL[shown]}`}>
        <Icon name="cloud" size={18} strokeWidth={2} className="acct-cloud" />
        {isIn ? (
          <>
            <span className="acct-avatar" aria-hidden="true"><Icon name="user" size={15} strokeWidth={2} /></span>
            <span className="acct-dot" aria-hidden="true" />
          </>
        ) : <span className="acct-label">Sign in to sync</span>}
      </button>
      {/* Only a failure is spoken: "Syncing…" and "Synced" after every answer would be noise. */}
      <span className="sr-only" role="status">{isIn && failed ? statusLine('pending', true) : ''}</span>
      {/*
        Signed-in and signed-out are separate COMPONENTS, not two branches of
        one. React diffs a component's output by position, so returning both
        shapes from a single component let it reuse the host <div> that Google's
        button had been rendered into: it swapped the className and kept the
        iframe, because an element GIS injected is not in React's tree and React
        never removes it. The result was a stale "Sign in as ..." button, name
        and email included, sitting inside the signed-in panel. Two component
        types force a real unmount and the iframe goes with it.
      */}
      {open && !isIn ? (
        <SignedOutPanel frame={{ sheet: open === 'sheet', id: panelId, onClose: close }}
                        onSignedIn={() => setSignedIn(true)} />
      ) : null}
      {open && isIn ? (
        <SignedInPanel frame={{ sheet: open === 'sheet', id: panelId, onClose: close }}
                       onSignedOut={() => setSignedIn(false)} />
      ) : null}
    </div>
  )
}

interface FrameProps { sheet: boolean; id: string; onClose: () => void }

/**
 * The box both panels sit in. Desktop: a non-modal popover under the badge
 * that takes focus when it opens. Phone: the shared bottom sheet, with its
 * scrim, close button and focus trap. The title is a <p>, not a heading: the
 * popover sits in the nav, before the page's h1.
 */
function Frame({ frame, label, title, children }: {
  frame: FrameProps; label: string; title: string; children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!frame.sheet) box.current?.focus() }, [frame.sheet])
  if (frame.sheet) {
    return <Modal title={title} onClose={frame.onClose} className="acct-sheet">{children}</Modal>
  }
  return (
    <div ref={box} id={frame.id} className="acct-panel" role="dialog" aria-label={label} tabIndex={-1}>
      <p className="acct-h">{title}</p>
      {children}
    </div>
  )
}

function SignedOutPanel({ frame, onSignedIn }: { frame: FrameProps; onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const slot = useRef<HTMLDivElement>(null)
  const rendered = useRef(false)

  // Google's script is fetched here and only here, on a panel the user opened
  // deliberately. Nothing loads it on app start.
  useEffect(() => {
    if (rendered.current || !slot.current) return
    rendered.current = true
    auth.renderButton(
      slot.current,
      async () => {
        onSignedIn()
        // Everything practised anonymously goes up on the first sync. Safe
        // because attempts are a grow-only set: re-sending is a no-op.
        await sync.seedOutbox()
        await sync.syncNow()
      },
      (message) => { setError(toUserMessage(message, 'signin')); rendered.current = false },
    ).catch((e: Error) => { setError(toUserMessage(e, 'signin')); rendered.current = false })
  }, [onSignedIn])

  return (
    <Frame frame={frame} label="Sync across devices" title="Keep your progress on every device">
      <ul className="acct-points">
        <li><Icon name="check" size={16} strokeWidth={2.2} />Your history on every device</li>
        <li><Icon name="check" size={16} strokeWidth={2.2} />We keep a random account number, never your name or email</li>
      </ul>
      <div className="acct-gbtn" ref={slot} />
      {error ? <p className="acct-err" role="alert">{error}</p> : null}
      <p className="acct-fine">
        LightBluePrep works fully without an account. Nothing is uploaded unless you
        sign in. <a className="acct-privacy" href={`${PRIVACY_URL}#sign-in`}>What sign-in stores</a>
      </p>
    </Frame>
  )
}

function SignedInPanel({ frame, onSignedOut }: { frame: FrameProps; onSignedOut: () => void }) {
  const onClose = frame.onClose
  const status = useSyncStatus()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [admin, setAdmin] = useState(false)
  useEffect(() => { fb.isAdmin().then(setAdmin).catch(() => setAdmin(false)) }, [])

  const handleSignOut = useCallback(async () => {
    setBusy(true)
    try {
      await auth.signOut()
      await sync.reset()
      onSignedOut()
      onClose()
    } catch (e) {
      setError(toUserMessage(e, 'server'))
    } finally {
      setBusy(false)
    }
  }, [onSignedOut, onClose])

  const handleDelete = useCallback(async () => {
    setBusy(true)
    try {
      await auth.deleteRemoteData()
      await sync.reset()
      onSignedOut()
      onClose()
    } catch (e) {
      setError(toUserMessage(e, 'server'))
    } finally {
      setBusy(false)
    }
  }, [onSignedOut, onClose])

  const failure = error || sync.getError()
  return (
    <Frame frame={frame} label="Sync status" title="Sync status">
      <p className="acct-status">
        <span className={`acct-dot ${status}`} aria-hidden="true" />
        {statusLine(status, Boolean(sync.getError()))}
      </p>
      {failure ? <p className="acct-err">{failure}</p> : null}

      <div className="acct-actions">
        <button className="acct-btn" disabled={busy || status === 'syncing'}
                onClick={() => { void sync.syncNow() }}>
          <Icon name="refresh" size={16} strokeWidth={2}
                className={status === 'syncing' ? 'acct-spin' : undefined} />
          Sync now
        </button>
        <button className="acct-btn" disabled={busy} onClick={() => { void handleSignOut() }}>
          Sign out
        </button>
      </div>
      <p className="acct-fine">Signing out keeps everything on this device.</p>
      {admin ? (
        <button className="acct-btn acct-inbox"
                onClick={() => { window.location.hash = 'inbox'; onClose() }}>
          Feedback inbox
        </button>
      ) : null}

      <div className="acct-danger">
        {confirmDelete ? (
          <>
            <p className="acct-p">
              Deletes everything stored on the server for your account. Practice
              history on this device is kept. Other devices you signed in on keep
              their own copy and are signed out.
            </p>
            <div className="acct-actions">
              <button className="acct-btn danger" disabled={busy}
                      onClick={() => { void handleDelete() }}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button className="acct-btn" disabled={busy} autoFocus
                      onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </div>
          </>
        ) : (
          <button className="acct-link" onClick={() => setConfirmDelete(true)}>
            Delete my synced data
          </button>
        )}
      </div>
    </Frame>
  )
}
