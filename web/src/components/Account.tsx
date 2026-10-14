/**
 * The account badge and its panel: the only sync affordance in the app.
 *
 * It lives in the top nav. Because lib/auth.ts loads Google's script lazily,
 * someone who never opens the panel never makes a request to Google either.
 *
 * When VITE_SYNC_API is unset (the localhost build) this renders nothing at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as auth from '../lib/auth'
import * as sync from '../lib/sync'
import * as fb from '../lib/feedback'
import { toUserMessage } from '../lib/errors'
import { Icon } from './Icon'

const LABEL: Record<sync.SyncStatus, string> = {
  // Says what the feature is, not just that it is off. "Not signed in" told you
  // the state but never that syncing was on offer.
  off: 'Sign in to sync',
  syncing: 'Syncing',
  synced: 'Synced',
  pending: 'Not synced',
}

/** Subscribes to the sync module so the dot tracks it without prop drilling. */
function useSyncStatus(): sync.SyncStatus {
  const [status, setStatus] = useState<sync.SyncStatus>(sync.getStatus())
  useEffect(() => sync.subscribe(() => setStatus(sync.getStatus())), [])
  return status
}

export function AccountBadge() {
  const status = useSyncStatus()
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState(auth.signedIn())
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
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

  return (
    <div className="acct" ref={wrap}>
      {/*
        Signed out, it says what it offers ("Sign in to sync"): a grey dot and
        "Not signed in" read as an offline indicator. Signed in, the desktop
        shows an avatar and the status dot; the phone header has room for an
        icon only, so there it is the cloud with the dot. The avatar is a
        generic figure on purpose: sign-in keeps only an anonymous account ID
        (privacy.html), so there is no name or photo to draw.
      */}
      <button className={`acct-badge ${status}${isIn ? ' in' : ''}`}
              onClick={() => setOpen((v) => !v)} aria-expanded={open}
              aria-label={isIn ? `Sync: ${LABEL[status]}` : LABEL.off}
              title="Sync and account">
        <Icon name="cloud" size={18} strokeWidth={2} className="acct-cloud" />
        {isIn ? (
          <>
            <span className="acct-avatar" aria-hidden="true"><Icon name="user" size={15} strokeWidth={2} /></span>
            <span className="acct-dot" aria-hidden="true" />
          </>
        ) : <span className="acct-label">{LABEL.off}</span>}
      </button>
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
        <SignedOutPanel onSignedIn={() => setSignedIn(true)} />
      ) : null}
      {open && isIn ? (
        <SignedInPanel onSignedOut={() => setSignedIn(false)}
                       onClose={() => setOpen(false)} />
      ) : null}
    </div>
  )
}

function SignedOutPanel({ onSignedIn }: { onSignedIn: () => void }) {
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
    <div className="acct-panel" role="dialog" aria-label="Sync">
      <h3 className="acct-h">Sync across devices</h3>
      <div className="acct-gbtn" ref={slot} />
      {error ? <p className="acct-err">{error}</p> : null}
      <p className="acct-fine">
        LightBluePrep works fully without an account. Nothing is uploaded unless you
        sign in.
      </p>
    </div>
  )
}

function SignedInPanel(
  { onSignedOut, onClose }: { onSignedOut: () => void; onClose: () => void },
) {
  const status = useSyncStatus()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [admin, setAdmin] = useState(false)
  useEffect(() => { fb.isAdmin().then(setAdmin).catch(() => setAdmin(false)) }, [])

  const handleSignOut = useCallback(async () => {
    setBusy(true)
    await auth.signOut()
    await sync.reset()
    onSignedOut()
    setBusy(false)
    onClose()
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

  return (
    <div className="acct-panel" role="dialog" aria-label="Sync">
      <h3 className="acct-h">Sync</h3>
      <p className="acct-status">
        <span className={`acct-dot ${status}`} aria-hidden="true" />
        {LABEL[status]}
        {status === 'pending' ? ', will retry' : null}
      </p>
      {error || sync.getError()
        ? <p className="acct-err">{error || sync.getError()}</p>
        : null}

      <div className="acct-actions">
        <button className="acct-btn" disabled={busy || status === 'syncing'}
                onClick={() => { void sync.syncNow() }}>
          <Icon name="arrow-right" size={14} strokeWidth={2.2} />
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
              history on this device is kept.
            </p>
            <div className="acct-actions">
              <button className="acct-btn danger" disabled={busy}
                      onClick={() => { void handleDelete() }}>
                {busy ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button className="acct-btn" disabled={busy}
                      onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button className="acct-link" onClick={() => setConfirmDelete(true)}>
            Delete my synced data
          </button>
        )}
      </div>
    </div>
  )
}
