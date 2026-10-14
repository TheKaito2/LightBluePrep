/**
 * Every question you've answered.
 *
 * Not just the ones you got wrong: the point is being able to look back at how
 * long something took and what you were thinking, which matters on the ones you
 * got right slowly as much as the ones you missed.
 *
 * Grouped section, then day, then difficulty. Reading and Maths are studied
 * separately, so they are separated here; the day says which sitting it was;
 * and easy-to-hard within a day is the order you would want to skim.
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
import { Mascot } from './Mascot'
import { TAG_LABEL } from './MistakeFields'
import { DIFFICULTIES, DIFFICULTY_NAME, SECTION_NAME, VERDICT, describeSet, fmt, plural } from '../lib/labels'
import { loadProcessTypes, typeOf, type ProcessTypes } from '../lib/similar'
import { duration } from '../lib/pacing'
import { graded } from '../lib/score'
import { toUserMessage } from '../lib/errors'
import { MISTAKE_TAGS, type MistakeTag, type PracticeSet, type Section, type SetItem } from '../types'

/**
 * Right first time, right eventually, and wrong are three different results.
 * The navigator grid has always drawn them as green / amber / red; this matches
 * it so the two views cannot disagree.
 */
function verdict(item: SetItem): { cls: string; label: string } {
  // Marked but never answered: only the Marked filter brings these in.
  if (item.answered_at === null) return { cls: 'neutral', label: VERDICT.unanswered }
  if (item.last_correct !== 1) return { cls: 'bad', label: VERDICT.incorrect }
  if (item.attempt_count > 1) return { cls: 'warn', label: VERDICT.retry }
  return { cls: 'ok', label: VERDICT.correct }
}

/** Day headings, so a long history reads as sittings rather than one wall. */
function dayKey(ts: number | null): string {
  if (!ts) return 'Earlier'
  const then = new Date(ts * 1000)
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const days = Math.floor((midnight.getTime() - then.getTime()) / 86400000) + 1
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'This week'
  if (days < 30) return 'This month'
  return then.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

type Filter = 'all' | 'incorrect' | 'marked' | 'logged'

const FILTERS: [Filter, string][] = [
  ['all', 'All'], ['incorrect', 'Incorrect'], ['marked', 'Marked'], ['logged', 'Has a note'],
]

interface Props {
  onPractice: (id: string) => void
  /** Practise a whole category in one go, in the order given. */
  onPracticeMany: (ids: string[], title: string) => void
  /** Open a finished set's score screen. */
  onOpenSet: (id: string) => void
  onDeleteSet: (id: string) => void
}

export function Review({ onPractice, onPracticeMany, onOpenSet, onDeleteSet }: Props) {
  const [sets, setSets] = useState<PracticeSet[] | null>(null)
  const [items, setItems] = useState<SetItem[] | null>(null)
  /** Questions with a mistake log, and their tags. Loaded up front. */
  const [logged, setLogged] = useState<Map<string, MistakeTag[]>>(new Map())
  const [filter, setFilter] = useState<Filter>('all')
  /** Narrows "Has a note" to one kind of mistake. Null is any. */
  const [tag, setTag] = useState<MistakeTag | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Process types, for the type name on each row. Optional: rows work without. */
  const [pt, setPt] = useState<ProcessTypes | null>(null)
  useEffect(() => { void loadProcessTypes().then(setPt) }, [])

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

  /** Finished sets, newest first. Rendered above the per-question history. */
  const setHistory = sets?.length ? (
    <section className="review-section">
      <h2 className="review-sectionhead">Practice sets</h2>
      <ul className="setlist">
        {sets.map((s) => {
          const g = graded(s.total, s.correct)
          return (
            <li key={s.id} className="setcard">
              <button className="setcard-main" onClick={() => onOpenSet(s.id)}>
                <span className="setcard-text">
                  <span className="setcard-t">{describeSet(s)}</span>
                  <span className="setcard-b">
                    {new Date((s.finished_at ?? s.created_at) * 1000)
                      .toLocaleDateString(undefined,
                        { month: 'short', day: 'numeric', year: 'numeric' })}
                    {s.seconds ? ` · ${duration(s.seconds)}` : ''}
                  </span>
                </span>
                <span className={`setcard-score ${g?.grade ?? ''}`}>
                  {fmt(s.correct)}<span className="dim">/{fmt(s.total)}</span>
                </span>
              </button>
              <span className="setcard-side">
                <button className="setcard-drop"
                        title="Delete this set"
                        onClick={() => {
                          setSets((prev) => prev?.filter((x) => x.id !== s.id) ?? prev)
                          onDeleteSet(s.id)
                        }}>
                  <Icon name="trash" size={15} strokeWidth={2} />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  ) : null

  const head = (aside?: ReactNode) => (
    <PageHead tone="amber" eyebrow="Your history" title="Review"
              sub="Every question you have answered, grouped by day, with the explanation one tap away.">
      {aside}
    </PageHead>
  )

  if (error) return <>{head()}<div className="review"><p className="review-empty">{error}</p></div></>
  if (!items) return <>{head()}<div className="review"><p className="review-empty">Loading…</p></div></>

  if (!items.length) {
    return (
      <>
        {head()}
        <div className="review">
          {setHistory}
          <Mascot className="review-bulb" size={96} />
          <p className="review-empty">
            Nothing here yet. Answer some questions and they'll show up, with how
            long each one took.
          </p>
        </div>
      </>
    )
  }

  // Unanswered rows are only there for Marked; everywhere else they'd be noise.
  const answered = items.filter((i) => i.answered_at !== null)
  /** One definition per category, shared by the filter list and the Redo tiles. */
  const pick = (f: Filter, t: MistakeTag | null): SetItem[] => (
    f === 'marked' ? items.filter((i) => i.flagged === 1)
      : answered.filter((i) => (
        f === 'incorrect' ? i.last_correct !== 1
          : f === 'logged' ? logged.has(i.id) && (!t || logged.get(i.id)!.includes(t))
            : true)))
  const shown = pick(filter, tag)
  const filterLabel = filter === 'logged' && tag ? TAG_LABEL[tag]
    : FILTERS.find(([f]) => f === filter)![1]

  const redo: { key: string; label: string; rows: SetItem[]; tag?: boolean }[] = [
    ...FILTERS.map(([f, label]) => ({ key: f, label, rows: pick(f, null) })),
    ...MISTAKE_TAGS.map((t) => ({ key: t, label: TAG_LABEL[t], rows: pick('logged', t), tag: true }))
      .filter((r) => r.rows.length),
  ]

  // Section, then day, then easy to hard. The list arrives newest first, so the
  // days keep that order simply by being met in turn.
  const sections: {
    section: Section
    days: { label: string; rows: SetItem[] }[]
  }[] = []
  for (const item of shown) {
    let group = sections.find((s) => s.section === item.section)
    if (!group) { group = { section: item.section, days: [] }; sections.push(group) }
    const label = dayKey(item.answered_at)
    let day = group.days.find((d) => d.label === label)
    if (!day) { day = { label, rows: [] }; group.days.push(day) }
    day.rows.push(item)
  }
  sections.sort((a, b) => (a.section === 'RW' ? -1 : 1) - (b.section === 'RW' ? -1 : 1))
  for (const group of sections) {
    for (const day of group.days) {
      day.rows.sort((a, b) => (
        DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty)
        || (b.answered_at ?? 0) - (a.answered_at ?? 0)))
    }
  }

  const correct = answered.filter((i) => i.last_correct === 1).length
  const total = answered.reduce((sum, i) => sum + (i.last_seconds ?? 0), 0)

  return (
    <>
    {head(
      <div className="htiles">
        <div className="htile"><span className="htile-n">{fmt(answered.length)}</span><span className="htile-l">answered</span></div>
        <div className="htile"><span className="htile-n">{answered.length ? Math.round((correct / answered.length) * 100) : 0}<small>%</small></span><span className="htile-l">correct</span></div>
        <div className="htile"><span className="htile-n">{duration(total)}</span><span className="htile-l">spent</span></div>
      </div>,
    )}
    <div className="review">
      <section className="redo" aria-labelledby="redo-h">
        <h2 id="redo-h" className="redo-h">Redo a whole pile</h2>
        <div className="redo-grid">
          {redo.map((r) => (
            <button key={r.key} className={r.tag ? 'redo-tile is-tag' : 'redo-tile'}
                    disabled={!r.rows.length}
                    onClick={() => onPracticeMany(r.rows.map((i) => i.id), `Review: ${r.label}`)}>
              <span className="redo-n">{fmt(r.rows.length)}</span>
              <span className="redo-l">{r.label}</span>
              <Icon name="arrow-right" size={18} strokeWidth={2.4} />
            </button>
          ))}
        </div>
      </section>

      {setHistory}

      <div className="seg review-filter" role="group" aria-label="Show">
        {FILTERS.map(([key, label]) => (
          <button key={key} className={filter === key ? 'seg-b on' : 'seg-b'}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {filter === 'logged' ? (
        <div className="chips review-tags" role="group" aria-label="Kind of mistake">
          {[null, ...MISTAKE_TAGS].map((t) => (
            <button key={t ?? 'any'} className={tag === t ? 'chip on' : 'chip'}
                    aria-pressed={tag === t}
                    onClick={() => setTag(t)}>
              {t ? TAG_LABEL[t] : 'Any'}
            </button>
          ))}
        </div>
      ) : null}

      {!shown.length ? (
        <>
          <Mascot className="review-bulb" mood="oops" size={72} />
          <p className="review-empty">Nothing matches this filter.</p>
        </>
      ) : null}

      {sections.map((group) => (
        <section key={group.section} className={`review-section spanel sec-${group.section}`}>
          <header className="spanel-h">
            <span className="spanel-ico">
              <Icon name={group.section === 'RW' ? 'book' : 'sigma'} size={24} strokeWidth={2} />
            </span>
            <div className="spanel-txt">
              <h2 className="spanel-t">{SECTION_NAME[group.section]}</h2>
              <p className="spanel-sub">
                {plural(group.days.reduce((sum, d) => sum + d.rows.length, 0), 'question')}
              </p>
            </div>
            {/* Every row in this section under the current filter, in one go. */}
            <button className="btn on-colour sm spanel-redo"
                    onClick={() => onPracticeMany(
                      group.days.flatMap((d) => d.rows.map((r) => r.id)),
                      `Review: ${SECTION_NAME[group.section]} · ${filterLabel}`)}>
              Redo {fmt(group.days.reduce((sum, d) => sum + d.rows.length, 0))}
              <Icon name="arrow-right" size={15} strokeWidth={2.4} />
            </button>
          </header>
          {group.days.map((day) => (
            <div key={day.label} className="review-group">
              <h3 className="review-day">{day.label}</h3>
              <ul className="review-list">
                {day.rows.map((item) => (
                  <li key={item.id}
                      className={open === item.id ? 'review-item open' : 'review-item'}>
                    <button className="review-row"
                            aria-expanded={open === item.id}
                            onClick={() => setOpen(open === item.id ? null : item.id)}>
                      {/* Correct on the third go is not the same as correct
                          first time, and the navigator already says so in
                          amber. Same three states, same colours. */}
                      <span className={`review-badge badge ${verdict(item).cls}`}>
                        {verdict(item).label}
                      </span>
                      <span className="review-main">
                        <span className="review-skill">{item.skill_name}</span>
                        <span className="review-meta">
                          {item.domain_name}
                          {pt && typeOf(item.cb_id, pt) ? ` · ${typeOf(item.cb_id, pt)!.label}` : ''}
                          {' · '}{DIFFICULTY_NAME[item.difficulty] ?? item.difficulty}
                        </span>
                      </span>
                      <span className="review-nums">
                        <span className="review-time">{duration(item.last_seconds)}</span>
                        {item.attempt_count > 1 ? (
                          <span className="review-tries">{item.attempt_count} tries</span>
                        ) : null}
                      </span>
                      <Icon name={open === item.id ? 'chevron-up' : 'chevron-down'}
                            size={16} strokeWidth={2.2} />
                    </button>
                    {open === item.id ? (
                      <QuestionDetail id={item.id}
                                      response={item.last_response}
                                      seconds={item.last_seconds ?? 0}
                                      onPractice={onPractice}
                                      onPracticeMany={onPracticeMany}
                                      onLogged={markLogged} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
    </>
  )
}
