/**
 * Settings: what the site keeps about you, and the buttons that delete it.
 *
 * This device and the synced copy can be deleted separately, because either
 * can be wanted alone: clearing a shared laptop, or leaving the service but
 * keeping your own history. Signed in, the local delete also offers both at
 * once, server first: deleting here, signing out, and then signing back in to
 * reach the server copy would pull everything straight back onto this device.
 * Keep the wording in step with public/privacy.html.
 */
import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import * as auth from '../lib/auth'
import * as sync from '../lib/sync'
import { countsPeople } from '../lib/usage'
import { PageHead } from './PageHead'
import { PRIVACY_URL } from './Github'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Stat, StatGroup } from './Stat'
import { plural } from '../lib/labels'
import { toUserMessage } from '../lib/errors'
import { isPersisted, requestPersistence } from '../lib/store'

type Summary = Awaited<ReturnType<NonNullable<typeof api.localDataSummary>>>
type Action = 'local' | 'both' | 'cloud'

const DONE: Record<Action, string> = {
  local: 'Deleted from this device.',
  both: 'Deleted from this device and from our server. You are signed out.',
  cloud: 'Deleted from our server. You are signed out.',
}

/** The whole summary as one sentence, for screen readers; the eye gets the stat row. */
function describe(s: Summary): string {
  const parts = [
    s.answers ? `${plural(s.answers, 'answer')} to ${plural(s.questions, 'question')}` : '',
    s.marked ? plural(s.marked, 'marked question') : '',
    s.highlights ? plural(s.highlights, 'highlight or note', 'highlights and notes') : '',
    s.mistakes ? plural(s.mistakes, 'logged mistake') : '',
    s.sets ? plural(s.sets, 'practice set') : '',
  ].filter(Boolean)
  if (!parts.length) return 'Nothing is saved on this device.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `Saved in this browser: ${list}.`
}

export function Settings() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirm, setConfirm] = useState<'local' | 'cloud' | null>(null)
  /** Signed in, whether the local delete also takes the server copy. */
  const [alsoServer, setAlsoServer] = useState(true)
  const [busy, setBusy] = useState(false)
  /** The last action and how it went; shown in the section it belongs to. */
  const [result, setResult] = useState<{ action: Action; error?: string } | null>(null)
  // Read on each render: a delete below signs out, and so can the account panel.
  const signedIn = auth.configured && auth.signedIn()

  const count = useCallback(() => {
    api.localDataSummary?.().then(setSummary)
      .catch((e: Error) => setResult({ action: 'local', error: toUserMessage(e) }))
  }, [])
  useEffect(count, [count])
  // A sync can pull rows in while this page is open (signing in, another device).
  useEffect(() => sync.subscribe(count), [count])

  const keep = useCallback(() => { if (!busy) setConfirm(null) }, [busy])

  /**
   * Whether the browser has agreed not to clear this site's data when space
   * runs low: null while unknown or where the browser cannot say, which hides
   * the button. `refused` is set when it said no to the button.
   */
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [refused, setRefused] = useState(false)
  useEffect(() => {
    if (api.deleteLocalData) void isPersisted().then(setPersisted)
  }, [])
  async function keepSafe() {
    const granted = await requestPersistence()
    setPersisted(granted)
    setRefused(!granted)
  }

  async function run(action: Action) {
    setBusy(true); setResult(null)
    try {
      if (action !== 'local') {
        // Server first: once the account is gone nothing can pull it back.
        await auth.deleteRemoteData()
      } else if (auth.signedIn()) {
        // Signed in, the next pull would put everything back. Signing out
        // stops that; reset() then waits for any sync already in flight.
        await auth.signOut()
      }
      await sync.reset()
      if (action !== 'cloud') {
        await api.deleteLocalData?.()
        count()
      }
      setResult({ action })
    } catch (e) {
      setResult({ action, error: toUserMessage(e, 'server') })
    } finally {
      setBusy(false); setConfirm(null)
    }
  }

  /**
   * Outcome under the section it concerns. The live region is always rendered,
   * so a screen reader announces the text when it appears: for the synced copy
   * the button that started it is gone by then.
   */
  const status = (section: 'local' | 'cloud') => {
    const mine = result && (result.action === 'cloud' ? 'cloud' : 'local') === section
    return (
      <div aria-live="polite">
        {mine && result.error ? <p className="fb-err settings-msg" role="alert">{result.error}</p> : null}
        {mine && !result.error ? (
          <p className="settings-done">
            <Icon name="check-circle" size={18} strokeWidth={2} />
            {DONE[result.action]}
          </p>
        ) : null}
      </div>
    )
  }

  const localAction: Action = signedIn && alsoServer ? 'both' : 'local'

  return (
    <>
      <PageHead tone="grey" title="Settings" sub="Your saved data, and the buttons that delete it." />
      <div className="settings">
        <section className="settings-sec" aria-labelledby="settings-local">
          <h2 className="about-h2" id="settings-local">On this device</h2>
          {api.deleteLocalData ? (
            <>
              {summary ? (
                <>
                  <p className="sr-only">{describe(summary)}</p>
                  <StatGroup className="settings-stats">
                    <Stat label="Answers" value={summary.answers.toLocaleString('en-US')} />
                    <Stat label="Marked" value={summary.marked.toLocaleString('en-US')} />
                    <Stat label="Logged mistakes" value={summary.mistakes.toLocaleString('en-US')} />
                    <Stat label="Sets" value={summary.sets.toLocaleString('en-US')} />
                  </StatGroup>
                </>
              ) : <p className="about-p">Counting…</p>}
              {persisted ? (
                <p className="settings-kept">
                  <Icon name="shield" size={16} strokeWidth={2} />
                  Your browser will keep your progress here, even when the device runs low on space.
                </p>
              ) : persisted === false ? (
                <div className="settings-keep">
                  <button className="btn" onClick={() => { void keepSafe() }}>
                    <Icon name="shield" size={16} strokeWidth={2} />
                    Keep my progress safe on this device
                  </button>
                  <p className="settings-fine" aria-live="polite">
                    {refused
                      ? 'Your browser said no for now. Browsers decide from how much you use a site;'
                        + ' installing it or bookmarking it usually helps.'
                      : 'Asks your browser not to clear this site\'s data when the device runs low on space.'}
                  </p>
                </div>
              ) : null}
              <button className="btn danger-secondary" onClick={() => { setConfirm('local'); setResult(null) }}>
                <Icon name="trash" size={16} strokeWidth={2} />
                Delete my data on this device
              </button>
              {status('local')}
              <p className="settings-fine">
                Questions you've opened stay cached, so they work offline.
                They are College Board's questions, not your data.
                {countsPeople ? ' A single flag that you were already counted as a visitor'
                  + ' also stays, so starting over does not count you twice. It holds no ID.' : ''}
                {' '}Full details are in the <a className="about-link" href={PRIVACY_URL}>privacy policy</a>.
              </p>
            </>
          ) : (
            <p className="about-p">
              Your progress lives in the database on the computer running this copy
              of LightBluePrep (data/bluebank.db). Delete that file to start over.
            </p>
          )}
        </section>

        {auth.configured ? (
          <section className="settings-sec" aria-labelledby="settings-cloud">
            <h2 className="about-h2" id="settings-cloud">Synced copy</h2>
            {signedIn ? (
              <>
                <p className="about-p">
                  You are signed in, so your practice history is also stored on our
                  server under an anonymous account ID, never your name or email.
                </p>
                <button className="btn danger-secondary" onClick={() => { setConfirm('cloud'); setResult(null) }}>
                  <Icon name="trash" size={16} strokeWidth={2} />
                  Delete my synced data
                </button>
              </>
            ) : (
              <p className="about-p">
                {result && !result.error && result.action !== 'local'
                  ? 'You are not signed in here, and your synced copy is deleted.'
                  : "You're not signed in, so nothing from this device is on our server."
                    + ' If you synced before, sign in to see and delete that copy. Signing in'
                    + " uploads this browser's history too, and Delete removes both."}
              </p>
            )}
            {status('cloud')}
          </section>
        ) : null}
      </div>

      {confirm === 'local' ? (
        <Modal title="Delete your data on this device?" onClose={keep}
               footer={(
                 <>
                   {/* Focus starts on the safe choice. */}
                   <button className="btn" disabled={busy} autoFocus onClick={keep}>Keep</button>
                   <button className="btn danger" disabled={busy} onClick={() => { void run(localAction) }}>
                     {busy ? 'Deleting…' : 'Delete'}
                   </button>
                 </>
               )}>
          <div className="settings-dialog">
            <p className="fb-p">
              This permanently deletes your answers, marks, highlights and notes,
              mistake log and practice sets from this browser. It cannot be undone.
            </p>
            {signedIn ? (
              <>
                <p className="fb-p">
                  You are signed in, so you will be signed out here. Signing in again
                  would bring back whatever is still on our server.
                </p>
                <label className="settings-check">
                  <input type="checkbox" checked={alsoServer} disabled={busy}
                         onChange={(e) => setAlsoServer(e.target.checked)} />
                  <span>Also delete my synced copy on our server</span>
                </label>
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {confirm === 'cloud' ? (
        <Modal title="Delete your synced data?" onClose={keep}
               footer={(
                 <>
                   <button className="btn" disabled={busy} autoFocus onClick={keep}>Keep</button>
                   <button className="btn danger" disabled={busy} onClick={() => { void run('cloud') }}>
                     {busy ? 'Deleting…' : 'Delete'}
                   </button>
                 </>
               )}>
          <div className="settings-dialog">
            <p className="fb-p">
              This permanently deletes everything stored on our server for your
              account and signs you out. What is on this device is kept.
            </p>
            <p className="fb-p">
              Other devices you signed in on keep their own copy and are signed out.
              Signing in on one of them uploads its copy again.
            </p>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
