/**
 * Every question you've answered.
 *
 * Not just the ones you got wrong: the point is being able to look back at how
 * long something took and what you were thinking, which matters on the ones you
 * got right slowly as much as the ones you missed.
 *
 * One filter bar picks the pile and the section, and its Redo button runs
 * exactly what the list below it shows. The list is grouped section, then day,
 * then difficulty: Reading and Math are studied separately, so they are
 * separated here; the day says which sitting it was; and easy-to-hard within a
 * day is the order you would want to skim.
 *
 * The list comes straight from the working set, which already carries the last
 * response, whether it was right, the seconds and the attempt count. Opening a
 * row fetches the body, the explanation and the full attempt history, so
 * nothing is loaded until asked for; on the static build that is a cache hit,
 * since you only ever answered questions you had already downloaded.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as api from '../api'
import { QuestionDetail } from './QuestionDetail'
import { Icon } from './Icon'
import { PageHead } from './PageHead'
import { SetCard } from './SetCard'
import { Stat, StatGroup } from './Stat'
import { EmptyState } from './EmptyState'
import { Segmented } from './Segmented'
import {
  DIFFICULTIES, DIFFICULTY_NAME, SECTIONS, SECTION_NAME, TAG_LABEL, VERDICT, dayLabel, daysAgo, fmt, plural, shortDate,
} from '../lib/labels'
import { loadProcessTypes, typeOf, type ProcessTypes } from '../lib/similar'
import { duration, isSlow } from '../lib/pacing'
import { dayKey } from '../lib/progress'
import { toUserMessage } from '../lib/errors'
import { MISTAKE_TAGS, type MistakeTag, type PracticeSet, type Section, type SetItem } from '../types'

type Filter = 'incorrect' | 'marked' | 'logged' | 'slow' | 'all'
type Scope = 'both' | Section

/** Piles first, in the order you would work through them; All last. */
const FILTERS: readonly [Filter, string][] = [
  ['incorrect', 'Incorrect'], ['marked', 'Marked'], ['logged', 'Logged'], ['slow', 'Slow'], ['all', 'All'],
]
const SCOPES: readonly Scope[] = ['both', 'RW', 'MATH']

/** Rows drawn per section before "Show 50 more". */
const PAGE = 50
/** Days at least this old start folded. */
const OLD_DAYS = 7

// Both choices are a convenience for this browser, like Home's picks: kept in
// localStorage, checked on the way back in, and lost quietly when storage is
// blocked (private windows throw on access).
const FILTER_KEY = 'lbp.review.filter'
const SCOPE_KEY = 'lbp.review.section'

function recall<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? v as T : fallback
  } catch { return fallback }
}

function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* blocked: the choice lasts for this visit */ }
}

/**
 * Right first time, right eventually, and wrong are three different results.
 * The navigator grid has always drawn them as green / amber / red; this matches
 * it so the two views cannot disagree. `regraded` is the verdict an opened
 * panel got against today's key, which wins over the stored one.
 */
function verdict(item: SetItem, regraded: boolean | undefined) {
  // Marked but never answered: only the Marked filter brings these in.
  if (item.answered_at === null) return { cls: 'neutral', label: VERDICT.unanswered, icon: null }
  const right = regraded ?? item.last_correct === 1
  if (!right) return { cls: 'bad', label: VERDICT.incorrect, icon: 'close' as const }
  if (item.attempt_count > 1) return { cls: 'warn', label: VERDICT.retry, icon: 'refresh' as const }
  return { cls: 'ok', label: VERDICT.correct, icon: 'check' as const }
}

interface Day { key: string; label: string; old: boolean; rows: SetItem[] }

/** Calendar days in the order met (the list arrives newest first), easy to hard inside each. */
function byDay(rows: SetItem[], now: Date): Day[] {
  const days: Day[] = []
  for (const item of rows) {
    const at = item.answered_at
    const key = at === null ? 'unanswered' : dayKey(new Date(at * 1000))
    let day = days.find((d) => d.key === key)
    if (!day) {
      day = at === null
        ? { key, label: 'Marked, not answered', old: false, rows: [] }
        : { key, label: dayLabel(at, now), old: daysAgo(at, now) >= OLD_DAYS, rows: [] }
      days.push(day)
    }
    day.rows.push(item)
  }
  // Marked-but-unanswered has no day; it goes last rather than wherever the first one sat.
  days.sort((a, b) => Number(a.key === 'unanswered') - Number(b.key === 'unanswered'))
  for (const day of days) {
    day.rows.sort((a, b) => (
      DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty)
      || (b.answered_at ?? 0) - (a.answered_at ?? 0)))
  }
  return days
}

/** Set accuracy as a status (spec 8.2): 70% and up ok, 40 to 69 warn, below 40 bad. */
const setTone = (pct: number) => (pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad')

interface Props {
  onPractice: (id: string) => void
  /** Practise a whole category in one go, in the order given. */
  onPracticeMany: (ids: string[], title: string) => void
  /** Open a finished set's score screen. */
  onOpenSet: (id: string) => void
  /** Resolves true once the set is deleted. */
  onDeleteSet: (id: string) => Promise<boolean>
  /** The empty page's way out: Home, where practice starts. */
  onStart: () => void
}

export function Review({ onPractice, onPracticeMany, onOpenSet, onDeleteSet, onStart }: Props) {
  const [sets, setSets] = useState<PracticeSet[] | null>(null)
  const [items, setItems] = useState<SetItem[] | null>(null)
  /** Questions with a mistake log, and their tags. Loaded up front. */
  const [logged, setLogged] = useState<Map<string, MistakeTag[]>>(new Map())
  const [filter, setFilterState] = useState<Filter>(() => recall(FILTER_KEY, FILTERS.map(([f]) => f), 'all'))
  const [scope, setScopeState] = useState<Scope>(() => recall(SCOPE_KEY, SCOPES, 'both'))
  /** Narrows Logged to one kind of mistake. Null is any. */
  const [tag, setTagState] = useState<MistakeTag | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Verdicts from opened panels, where today's key disagrees with the stored one. */
  const [regraded, setRegraded] = useState<Map<string, boolean>>(new Map())
  /** Rows drawn per section. */
  const [limit, setLimit] = useState(PAGE)
  /** Days whose fold the student flipped, away from its default. */
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  /** Process types, for the type name on each row. Optional: rows work without. */
  const [pt, setPt] = useState<ProcessTypes | null>(null)
  useEffect(() => { void loadProcessTypes().then(setPt) }, [])

  // A new pile starts at its first page.
  const setFilter = (f: Filter) => { setFilterState(f); setTagState(null); setLimit(PAGE); remember(FILTER_KEY, f) }
  const setScope = (s: Scope) => { setScopeState(s); setLimit(PAGE); remember(SCOPE_KEY, s) }
  const setTag = (t: MistakeTag | null) => { setTagState(t); setLimit(PAGE) }

  /**
   * Stable identity, and it returns the previous Map unchanged when nothing
   * moved. Both matter: Detail calls this from an effect, so a new closure or a
   * new Map every time would re-render the parent, hand Detail a new callback,
   * and re-run the effect forever.
   */
  const markLogged = useCallback((qid: string, tags: MistakeTag[] | null) => {
    setLogged((prev) => {
      if ((tags?.join() ?? null) === (prev.get(qid)?.join() ?? null)) return prev
      const next = new Map(prev)
      if (tags) next.set(qid, tags)
      else next.delete(qid)
      return next
    })
  }, [])

  // Same rule as markLogged: stable, and a no-op when nothing changed.
  const markRegraded = useCallback((qid: string, correct: boolean) => {
    setRegraded((prev) => {
      if (prev.get(qid) === correct) return prev
      return new Map(prev).set(qid, correct)
    })
  }, [])

  useEffect(() => {
    api.reviewed()
      .then((d) => setItems(d.questions))
      .catch((e: Error) => setError(toUserMessage(e)))
    // Up front, not as rows are opened: a filter that only knows about what you
    // already clicked is not a filter.
    api.loggedIds()
      .then((d) => setLogged(new Map(d.question_ids.map((id) => [id, d.tags?.[id] ?? []]))))
      .catch(() => { /* the filter degrades to empty, the page still works */ })
    // Finished sets. A failure leaves the section out rather than the page.
    api.listSets(false)
      .then(setSets)
      .catch(() => setSets([]))
  }, [])

  const now = new Date()

  /** Finished sets, newest first, at the end of the page. */
  const setHistory = sets?.length ? (
    <section className="review-sets" aria-labelledby="review-sets-h">
      <h2 id="review-sets-h" className="h1-section">Practice sets</h2>
      <ul className="setlist">
        {sets.map((s) => {
          const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0
          return (
            <SetCard key={s.id} set={s} onOpen={() => onOpenSet(s.id)}
                     meta={[
                       shortDate(s.finished_at ?? s.created_at, now),
                       s.seconds ? duration(s.seconds) : '',
                     ].filter(Boolean).join(' · ')}
                     aside={<>
                       <span className={`badge ${setTone(pct)} setcard-pct`}>{pct}%</span>
                       <span className="setcard-score">
                         {fmt(s.correct)}/{fmt(s.total)}
                       </span>
                       <Icon name="chevron-right" size={16} strokeWidth={2.2} className="setcard-chev" />
                     </>}
                     onDelete={async () => {
                       // The row goes only once the delete has really happened.
                       const ok = await onDeleteSet(s.id)
                       if (ok) setSets((prev) => prev?.filter((x) => x.id !== s.id) ?? prev)
                       return ok
                     }} />
          )
        })}
      </ul>
    </section>
  ) : null

  const head = (aside?: ReactNode) => (
    <PageHead tone="ink" title="Review"
              sub="Every question you've answered, with its explanation one click away.">
      {aside}
    </PageHead>
  )

  if (error) {
    return <>{head()}<div className="review"><EmptyState mood="oops" heading="h2" title="Couldn't load your answers" body={error} /></div></>
  }
  if (!items) {
    return (
      <>
        {head()}
        <div className="review" aria-busy="true">
          <span className="sr-only" role="status">Loading your answers</span>
          <ul className="review-list review-skel">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="review-item">
                <span className="skel review-skel-b" />
                <span className="review-main">
                  <span className="skel setres-skel-t" />
                  <span className="skel setres-skel-m" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  if (!items.length) {
    return (
      <>
        {head()}
        <div className="review">
          <EmptyState heading="h2" title="Nothing to review yet"
                      body="Answer a question and it lands here with its explanation and your time."
                      action={{ label: 'Start practicing', onClick: onStart }} />
          {setHistory}
        </div>
      </>
    )
  }

  // Unanswered rows are only there for Marked; everywhere else they'd be noise.
  const answered = items.filter((i) => i.answered_at !== null)
  const inScope = (i: SetItem) => scope === 'both' || i.section === scope
  /** One definition per pile, shared by the counts, the list and Redo. */
  const pick = (f: Filter, t: MistakeTag | null): SetItem[] => (
    f === 'marked' ? items.filter((i) => i.flagged === 1 && inScope(i))
      : answered.filter((i) => inScope(i) && (
        f === 'incorrect' ? i.last_correct !== 1
          : f === 'logged' ? (t ? logged.get(i.id)?.includes(t) ?? false : logged.has(i.id))
            : f === 'slow' ? isSlow(i.section, i.last_seconds)
              : true)))
  const shown = pick(filter, tag)
  const filterName = FILTERS.find(([f]) => f === filter)?.[1] ?? 'All'
  const pileName = filter === 'logged' && tag ? TAG_LABEL[tag] : filterName
  const scopeName = scope === 'both' ? '' : ` · ${SECTION_NAME[scope]}`

  const sections = SECTIONS
    .map((section) => ({ section, rows: shown.filter((i) => i.section === section) }))
    .filter((g) => g.rows.length)

  const correct = answered.filter((i) => i.last_correct === 1).length
  const total = answered.reduce((sum, i) => sum + (i.last_seconds ?? 0), 0)

  return (
    <>
    {head(
      <StatGroup>
        <Stat size="l" label="Answered" value={fmt(answered.length)} />
        <Stat size="l" label="Correct"
              value={`${answered.length ? Math.round((correct / answered.length) * 100) : 0}%`} />
        <Stat size="l" label="Time" value={duration(total)} />
      </StatGroup>,
    )}
    <div className="review">
      <div className="review-bar">
        <Segmented legend="Show" hideLegend className="review-piles" value={filter} onChange={setFilter}
                   options={FILTERS.map(([f, label]) => ({
                     value: f,
                     label: <>{label} <span className="seg-n">{fmt(pick(f, null).length)}</span></>,
                   }))} />
        <Segmented legend="Section" hideLegend className="review-scope" value={scope} onChange={setScope}
                   options={SCOPES.map((s) => ({
                     value: s,
                     label: s === 'both' ? 'Both' : (
                       <>
                         <span className={`sec-${s} review-scope-ico`}>
                           <Icon name={s === 'RW' ? 'book' : 'sigma'} size={16} />
                         </span>
                         {SECTION_NAME[s]}
                       </>
                     ),
                   }))} />
        <button className="btn primary sm review-redo" disabled={!shown.length}
                onClick={() => onPracticeMany(shown.map((i) => i.id), `Review: ${pileName}${scopeName}`)}>
          {filter === 'all' && !tag ? `Redo all ${fmt(shown.length)}` : `Redo these ${fmt(shown.length)}`}
          <Icon name="arrow-right" size={16} strokeWidth={2.2} />
        </button>
      </div>

      {filter === 'logged' ? (
        <div className="chips review-tags" role="group" aria-label="Kind of mistake">
          {[null, ...MISTAKE_TAGS].map((t) => {
            const n = pick('logged', t).length
            return (
              <button key={t ?? 'any'} className={tag === t ? 'chip on' : 'chip'}
                      aria-pressed={tag === t} disabled={!n && tag !== t}
                      onClick={() => setTag(t)}>
                {t ? TAG_LABEL[t] : 'Any'}
                <span className="chip-n">{fmt(n)}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {!shown.length ? (
        <EmptyState className="review-none" heading="h2" title="Nothing in this pile"
                    body={filter === 'slow' ? 'Every answer here came in within a quarter of SAT pace.'
                      : filter === 'logged' ? 'Log a mistake from an incorrect answer and it shows up here.'
                        : 'Pick another pile or section above.'} />
      ) : null}

      {sections.map(({ section, rows }) => {
        let budget = limit
        const days = byDay(rows, now)
        const drawn = days.map((day) => {
          const id = `${section}:${day.key}`
          const folded = day.old !== flipped.has(id)
          const take = folded || budget <= 0 ? 0 : Math.min(budget, day.rows.length)
          // A day starts only while the page has room; a folded one costs nothing.
          const visible = folded ? budget > 0 : take > 0
          budget -= take
          return { day, id, folded, visible, rows: day.rows.slice(0, take) }
        }).filter((d) => d.visible)
        const left = rows.length - drawn.reduce((n, d) => n + d.rows.length, 0)
          - drawn.filter((d) => d.folded).reduce((n, d) => n + d.day.rows.length, 0)
        return (
          <section key={section} className={`review-section spanel sec-${section}`}
                   aria-labelledby={`review-${section}`}>
            <header className="spanel-h">
              <span className="spanel-ico">
                <Icon name={section === 'RW' ? 'book' : 'sigma'} size={18} strokeWidth={2} />
              </span>
              <div className="spanel-txt">
                <h2 className="spanel-t" id={`review-${section}`}>{SECTION_NAME[section]}</h2>
                <p className="spanel-sub">{plural(rows.length, 'question')}</p>
              </div>
              {/* Every row in this section under the current pile, in one go. */}
              <button className="btn on-colour sm spanel-redo"
                      onClick={() => onPracticeMany(rows.map((r) => r.id),
                        `Review: ${SECTION_NAME[section]} · ${pileName}`)}>
                Redo {fmt(rows.length)}
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            </header>
            {drawn.map(({ day, id, folded, rows: dayRows }) => {
              const done = day.rows.filter((i) => i.answered_at !== null)
              const right = done.filter((i) => ['ok', 'warn'].includes(verdict(i, regraded.get(i.id)).cls)).length
              return (
                <div key={id} className="review-group">
                  <h3 className="review-day">
                    <button type="button" className="review-day-b" aria-expanded={!folded}
                            onClick={() => setFlipped((prev) => {
                              const next = new Set(prev)
                              if (!next.delete(id)) next.add(id)
                              return next
                            })}>
                      <Icon name={folded ? 'chevron-right' : 'chevron-down'} size={14} strokeWidth={2.2} />
                      <span className="review-day-t">{day.label}</span>
                      <span className="review-day-sum">
                        {done.length
                          ? `${fmt(done.length)} answered · ${fmt(right)} correct`
                          : plural(day.rows.length, 'question')}
                      </span>
                    </button>
                  </h3>
                  {folded ? null : (
                    <ul className="review-list">
                      {dayRows.map((item) => (
                        <Row key={item.id} item={item} pt={pt} logged={logged.has(item.id)}
                             regraded={regraded.get(item.id)} open={open === item.id}
                             onToggle={() => setOpen(open === item.id ? null : item.id)}>
                          <QuestionDetail id={item.id}
                                          response={item.last_response}
                                          seconds={item.last_seconds ?? 0}
                                          onPractice={onPractice}
                                          onPracticeMany={onPracticeMany}
                                          onLogged={markLogged}
                                          editable={item.answered_at !== null && item.last_correct !== 1}
                                          graded={item.answered_at === null ? undefined : item.last_correct === 1}
                                          onRegrade={markRegraded} />
                        </Row>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {left > 0 ? (
              <button className="btn quiet sm review-more" onClick={() => setLimit((n) => n + PAGE)}>
                Show {fmt(Math.min(PAGE, left))} more
                <Icon name="chevron-down" size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </section>
        )
      })}

      {setHistory}
    </div>
    </>
  )
}

function Row({ item, pt, logged, regraded, open, onToggle, children }: {
  item: SetItem
  pt: ProcessTypes | null
  logged: boolean
  regraded: boolean | undefined
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const v = verdict(item, regraded)
  const type = pt ? typeOf(item.cb_id, pt) : null
  const slow = item.answered_at !== null && isSlow(item.section, item.last_seconds)
  return (
    <li className={open ? 'review-item open' : 'review-item'}>
      <button className="review-row" aria-expanded={open} onClick={onToggle}>
        {/* Correct on the third go is not the same as correct first time,
            and the navigator already says so in amber. Same three states,
            same colours. */}
        <span className={`review-badge badge ${v.cls}`}>
          {v.icon ? <Icon name={v.icon} size={12} strokeWidth={2.6} /> : null}
          <span className="badge-t">{v.label}</span>
        </span>
        <span className="review-main">
          <span className="review-skill">
            {item.skill_name}
            {item.flagged === 1 ? (
              <span className="review-flag" role="img" aria-label="Marked"><Icon name="bookmark" size={14} /></span>
            ) : null}
            {logged ? (
              <span className="review-logged" role="img" aria-label="Mistake logged"><Icon name="note" size={14} /></span>
            ) : null}
          </span>
          <span className="review-meta">
            <i className={`review-dot d-${item.difficulty}`} aria-hidden="true" />
            {DIFFICULTY_NAME[item.difficulty] ?? item.difficulty}
            {' · '}{item.domain_name}
            {type ? ` · ${type.label}` : ''}
          </span>
        </span>
        {item.answered_at !== null ? (
          <span className="review-nums">
            <span className={slow ? 'review-time slow' : 'review-time'}>{duration(item.last_seconds)}</span>
            {slow ? <span className="review-slow">Slow</span>
              : item.attempt_count > 1 ? <span className="review-tries">{item.attempt_count} tries</span> : null}
          </span>
        ) : null}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2.2} />
      </button>
      {open ? children : null}
    </li>
  )
}
