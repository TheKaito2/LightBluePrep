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
import { PageHead } from './PageHead'
import { plural } from '../lib/labels'
import { toUserMessage } from '../lib/errors'

type Summary = Awaited<ReturnType<NonNullable<typeof api.localDataSummary>>>
type Action = 'local' | 'both' | 'cloud'

const DONE: Record<Action, string> = {
  local: 'Deleted from this device.',
  both: 'Deleted from this device and from our server. You are signed out.',
  cloud: 'Deleted from our server. You are signed out.',
}

function describe(s: Summary): string {
  const parts = [
    s.answers ? `${plural(s.answers, 'answer')} to ${plural(s.questions, 'question')}` : '',
    s.marked ? plural(s.marked, 'marked question') : '',
    s.highlights ? plural(s.highlights, 'highlight or note', 'highlights and notes') : '',
    s.mistakes ? plural(s.mistakes, 'mistake log') : '',
    s.sets ? plural(s.sets, 'practice set') : '',
  ].filter(Boolean)
  if (!parts.length) return 'Nothing is saved on this device.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `Saved in this browser: ${list}.`
}

export function Settings() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirm, setConfirm] = useState<'local' | 'cloud' | null>(null)
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
   * so a screen reader announces the text when it appears: the button that
   * started it is gone by then.
   */
  const status = (section: 'local' | 'cloud') => {
    const mine = result && (result.action === 'cloud' ? 'cloud' : 'local') === section
    return (
      <div aria-live="polite">
        {mine && result.error ? <p className="fb-err" role="alert">{result.error}</p> : null}
        {mine && !result.error ? <p className="settings-done">{DONE[result.action]}</p> : null}
      </div>
    )
  }

  const cancel = (
    // Focus lands here when a confirm opens: the button that was clicked is gone.
    <button className="btn quiet" disabled={busy} autoFocus onClick={() => setConfirm(null)}>
      Cancel
    </button>
  )

  return (
    <>
      <PageHead tone="grey" title="Settings"
                sub="What LightBluePrep keeps about you, and how to delete it." />
      <div className="about settings">
        <section className="about-block">
          <h2 className="about-h2">On this device</h2>
          {api.deleteLocalData ? (
            <>
              <p className="about-p">{summary ? describe(summary) : 'Counting…'}</p>
              {confirm === 'local' ? (
                <div className="settings-confirm">
                  <p className="about-p">
                    This permanently deletes your answers, marks, highlights and notes,
                    mistake log and practice sets from this browser. It cannot be undone.
                    {signedIn ? ' You are signed in, so you will be signed out here.'
                      + ' Your synced copy stays on our server unless you delete that too,'
                      + ' and signing in again would bring it back.' : ''}
                  </p>
                  <div className="settings-actions">
                    {signedIn ? (
                      <>
                        <button className="btn danger" disabled={busy} onClick={() => { void run('both') }}>
                          {busy ? 'Deleting…' : 'Delete here and on the server'}
                        </button>
                        <button className="btn danger-secondary" disabled={busy} onClick={() => { void run('local') }}>
                          Delete on this device only
                        </button>
                      </>
                    ) : (
                      <button className="btn danger" disabled={busy} onClick={() => { void run('local') }}>
                        {busy ? 'Deleting…' : 'Yes, delete it'}
                      </button>
                    )}
                    {cancel}
                  </div>
                </div>
              ) : (
                <button className="btn danger-secondary" onClick={() => { setConfirm('local'); setResult(null) }}>
                  Delete my data on this device
                </button>
              )}
              {status('local')}
              <p className="about-p settings-fine">
                Questions you have opened stay cached so the site keeps working offline.
                They are College Board's questions, not your data. Full details are in
                the <a className="about-link" href="/privacy.html">privacy policy</a>.
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
          <section className="about-block">
            <h2 className="about-h2">Synced copy</h2>
            {signedIn ? (
              <>
                <p className="about-p">
                  You are signed in, so your practice history is also stored on our
                  server under an anonymous account ID, never your name or email.
                </p>
                {confirm === 'cloud' ? (
                  <div className="settings-confirm">
                    <p className="about-p">
                      This permanently deletes everything stored on our server for your
                      account and signs you out. What is on this device is kept.
                    </p>
                    <div className="settings-actions">
                      <button className="btn danger" disabled={busy} onClick={() => { void run('cloud') }}>
                        {busy ? 'Deleting…' : 'Yes, delete it'}
                      </button>
                      {cancel}
                    </div>
                  </div>
                ) : (
                  <button className="btn danger-secondary" onClick={() => { setConfirm('cloud'); setResult(null) }}>
                    Delete my synced data
                  </button>
                )}
              </>
            ) : (
              <p className="about-p">
                {result && !result.error && result.action !== 'local'
                  ? 'You are not signed in here, and your synced copy is deleted.'
                  : 'You are not signed in here, so nothing from this device goes to our'
                    + ' server. A copy you synced before stays there: sign in, then use'
                    + ' Delete here and on the server above.'}
              </p>
            )}
            {status('cloud')}
          </section>
        ) : null}

      </div>
    </>
  )
}
