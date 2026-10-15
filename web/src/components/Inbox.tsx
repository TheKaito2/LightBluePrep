/**
 * The feedback inbox. Only reachable by an account listed in the Worker's
 * ADMIN_SUBS; everyone else gets a 403 from the API and this says so.
 */
import { useCallback, useEffect, useState } from 'react'
import * as fb from '../lib/feedback'
import { PageHead } from './PageHead'
import { Stat, StatGroup } from './Stat'
import { ConfirmDelete } from './ConfirmDelete'
import { Icon } from './Icon'

type Show = 'open' | 'done' | 'all'

/** How far back "delete open messages" reaches. A spam flood is recent. */
const SPANS = [['hour', 3600], ['day', 86400], ['week', 7 * 86400]] as const
type Span = (typeof SPANS)[number][0]

function when(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function Inbox() {
  const [items, setItems] = useState<fb.FeedbackItem[] | null>(null)
  /** Whole-inbox counts from the Worker; null from one that predates them. */
  const [counts, setCounts] = useState<{ total: number; open: number } | null>(null)
  const [older, setOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('open')
  const [span, setSpan] = useState<Span>('hour')
  const [usage, setUsage] = useState<fb.UsageStats | null>(null)

  const load = useCallback(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- clears the last error for the fetch this starts
    setError(null)
    fb.list().then((page) => {
      setItems(page.feedback)
      setCounts(page.total === undefined ? null : { total: page.total, open: page.open ?? 0 })
    }).catch((e: Error) => setError(e.message))
    // The list call above already reports a refusal; this one just stays hidden.
    fb.stats().then(setUsage).catch(() => setUsage(null))
  }, [])
  useEffect(load, [load])

  /** The next page back. The Worker repeats the boundary second, so drop what is already here. */
  async function loadOlder() {
    const last = items?.at(-1)
    if (!last) return
    setOlder(true)
    try {
      const page = await fb.list(last.created_at)
      setItems((have) => {
        const seen = new Set((have ?? []).map((i) => i.id))
        return [...(have ?? []), ...page.feedback.filter((i) => !seen.has(i.id))]
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOlder(false)
    }
  }

  /** True once done, so ConfirmDelete knows whether to put its button back. */
  async function act(fn: () => Promise<void>): Promise<boolean> {
    try { await fn(); load(); return true } catch (e) { setError((e as Error).message); return false }
  }

  const loaded = items ?? []
  const shown = loaded.filter((i) => show === 'all' || i.status === show)
  const openCount = counts ? counts.open : loaded.filter((i) => i.status === 'open').length
  const total = counts ? counts.total : loaded.length
  const more = loaded.length < total
  const spanSeconds = SPANS.find(([k]) => k === span)?.[1] ?? 3600

  return (
    <>
    <PageHead tone="ink" eyebrow="Owner only" title="Feedback inbox"
              sub="Messages from the feedback form, and the anonymous usage counts.">
      {/* The anonymous counts from lib/usage.ts. Browsers, not people: one
          person on two devices counts twice. The Worker's day is UTC, and it
          stops counting a day at a ceiling meant for scripts ("capped"). */}
      {usage ? (
        <StatGroup className="inbox-strip" label="Usage counts">
          <Stat size="l" label="Tried it" value={usage.tried.toLocaleString('en-US')} sub="1+ question" />
          <Stat size="l" label="Used it" value={usage.used.toLocaleString('en-US')} sub="10+ questions" />
          <Stat size="l" label="New" value={usage.tried_today.toLocaleString('en-US')}
                sub={usage.capped ? 'today (UTC), capped' : 'today (UTC)'} />
          <Stat size="l" label="Accounts" value={usage.accounts.toLocaleString('en-US')} sub="signed in" />
        </StatGroup>
      ) : null}
    </PageHead>
    <div className="inbox">
      <div className="inbox-head">
        <p className="qsub">
          {openCount} open · {total} total
          {more ? ` (showing the newest ${loaded.length})` : ''}
        </p>
        <button className="btn sm" onClick={load}>
          <Icon name="refresh" size={16} strokeWidth={2} />
          Refresh
        </button>
      </div>
      {usage ? <p className="qsub inbox-note">Usage counted since 12 October 2026, per browser.</p> : null}
      {loaded.some((i) => i.status === 'done') ? (
        <div className="inbox-purge">
          <span>Delete all done</span>
          <ConfirmDelete label="Delete every message marked done" onConfirm={() => act(fb.removeDone)} />
        </div>
      ) : null}
      {openCount > 0 && counts ? (
        <div className="inbox-purge">
          <label htmlFor="inbox-span">Delete open messages from the last</label>
          <select id="inbox-span" className="sel inbox-span" value={span}
                  onChange={(e) => setSpan(e.target.value as Span)}>
            {SPANS.map(([k]) => <option key={k} value={k}>{k}</option>)}
          </select>
          <ConfirmDelete label={`Delete every open message from the last ${span}`}
                         onConfirm={() => act(() => fb.removeOpenSince(Math.floor(Date.now() / 1000) - spanSeconds))} />
        </div>
      ) : null}

      <div className="seg sm inbox-seg" role="group" aria-label="Show">
        {(['open', 'done', 'all'] as const).map((s) => (
          <button key={s} aria-pressed={show === s}
                  className={show === s ? 'seg-b on' : 'seg-b'} onClick={() => setShow(s)}>
            {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
          </button>
        ))}
      </div>

      {error ? (
        <p className="fb-err">
          {/^not allowed/i.test(error) ? 'This inbox is only for the site owner. Sign in with the owner account.' : error}
        </p>
      ) : null}
      {items === null && !error ? <p className="qsub" role="status">Loading…</p> : null}
      {items && !shown.length ? <p className="qsub">Nothing here.</p> : null}

      <ul className="inbox-list">
        {shown.map((i) => (
          <li key={i.id} className={`inbox-item is-${i.status}`}>
            <div className="inbox-meta">
              <span className={`inbox-kind k-${i.kind}`}>{i.kind === 'bug' ? 'Bug' : 'Comment'}</span>
              <span>{when(i.created_at)}</span>
              {i.cb_id ? <code className="qid">{i.cb_id}</code> : null}
              {i.context ? <span className="inbox-ctx">from {i.context}</span> : null}
            </div>
            <p className="inbox-msg">{i.message}</p>
            <div className="inbox-actions">
              <button className="btn sm"
                      onClick={() => act(() => fb.setStatus(i.id, i.status === 'open' ? 'done' : 'open'))}>
                {i.status === 'open' ? 'Mark done' : 'Reopen'}
              </button>
              <ConfirmDelete label="Delete message" onConfirm={() => act(() => fb.remove(i.id))} />
            </div>
          </li>
        ))}
      </ul>
      {more ? (
        <button className="btn sm inbox-older" disabled={older} onClick={() => { void loadOlder() }}>
          {older ? 'Loading…' : 'Load older'}
        </button>
      ) : null}
    </div>
    </>
  )
}
