import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Mascot } from './Mascot'
import { Footer } from './Footer'
import { ProgressStrip } from './ProgressStrip'
import { Modal } from './Modal'
import { EmptyState } from './EmptyState'
import { Segmented } from './Segmented'
import { ResumeLabel, SetCard } from './SetCard'
import { loadProcessTypes, typeCounts, type ProcessTypes } from '../lib/similar'
import { setSeconds, formatClock } from '../lib/pacing'
import { SIZES } from '../lib/prefs'
import {
  DIFFICULTIES, DIFFICULTY_NAME, SECTIONS, SECTION_NAME, SECTION_SHORT, andMore, describeSet, fmt, plural,
} from '../lib/labels'
import { graded } from '../lib/score'
import { rollup, type DomainTally } from '../lib/taxonomy'
import { idNeedle } from '../lib/route'
import type { Order } from '../lib/order'
import type { HistoryRow } from '../lib/progress'
import type {
  Filters, PracticeSet, Section, SetItem, Stats, Status, TaxonomyRow,
} from '../types'

interface Props {
  taxonomy: TaxonomyRow[]
  /** A taxonomy fetch is in flight. Empty and not loading means it failed. */
  taxonomyLoading: boolean
  /** Re-run the first load after it failed. */
  onRetryBoot: () => void
  /**
   * The pool under the difficulty and status filters alone, all topics, or
   * null when neither filter is set. Drives the per-skill filtered counts.
   */
  facet: SetItem[] | null
  stats: Stats | null
  history: HistoryRow[]
  value: Filters
  /** The filtered pool, in the order practice walks it. */
  items: SetItem[]
  loading: boolean
  onChange: (next: Filters) => void
  /** Open practice at this index of `items`. */
  onOpen: (index: number) => void
  /** Draw and start a fixed-size set from the pool. */
  onStart: () => void
  /** Start 10 questions from the whole bank, ignoring the topic picker. */
  onQuickStart: () => void
  /** Start the balanced 20-question set that unlocks the score estimate. */
  onScoreCheck: () => void
  order: Order
  onOrder: (next: Order) => void
  activeSets: PracticeSet[]
  onResume: (id: string) => void
  /** Resolves true once the set is deleted. */
  onAbandon: (id: string) => Promise<boolean>
  /** Every question whose College Board ID matches, for the search box. */
  findIds: (needle: string) => Promise<SetItem[]>
  /** Open one question on its own. */
  onOpenId: (id: string) => void
}

/**
 * Which questions inside the chosen topics. One choice, mapped onto `statuses`
 * (joined with "+"). "Not answered or incorrect" is what Stats' Practice
 * buttons pick, so Home can show that choice when you come back.
 */
const WHICH: { key: string; label: string }[] = [
  { key: 'all', label: 'All questions' },
  { key: 'unseen', label: 'Not answered yet' },
  { key: 'wrong', label: 'Incorrect' },
  { key: 'unseen+wrong', label: 'Not answered or incorrect' },
  { key: 'flagged', label: 'Marked for review' },
  { key: 'correct', label: 'Correct' },
]

/** 0 is "no limit": practise the whole pool, open-ended. */
const LENGTHS = SIZES.map((n) => ({ value: n, label: n ? String(n) : 'No limit' }))

/** Test pace first, then easier, with the harder drill last. 0 is untimed. */
const TIMERS = [
  { value: 0, label: 'Untimed' },
  { value: 1, label: '1× (test pace)' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 0.75, label: '0.75× speed drill' },
]

/** Random is a reshuffle of Shuffled, not a third order: it shows as Shuffled. */
const ORDERS = [
  { value: 'shuffled', label: 'Shuffled' },
  { value: 'topic', label: 'By topic' },
] as const


const SECTION_ICON = { RW: 'book', MATH: 'sigma' } as const

/** Unfinished sets shown before the rest fold behind "Show N more". */
const SETS_SHOWN = 2

/** How long the first load may run before saying the connection is slow. */
const SLOW_MS = 8000

/** The word after a filtered count on a skill row ("87 hard"). */
const STATUS_WORD: Record<Status, string> = {
  unseen: 'not answered', wrong: 'incorrect', flagged: 'marked', correct: 'correct',
}

/**
 * Graded accuracy, and only from enough answers to judge: one lucky question
 * is not "100%". Below that the row's count says all there is to say.
 */
function Acc({ seen, correct }: { seen: number; correct: number }) {
  const g = graded(seen, correct)
  if (!g) return null
  return <span className={`acc ${g.grade}`} title={`${fmt(correct)} of ${fmt(seen)} correct`}>{g.pct}%</span>
}

export function Home({
  taxonomy, taxonomyLoading, onRetryBoot, facet, stats, history, value, items, loading, onChange, onOpen, onStart,
  order, onOrder, activeSets, onResume, onAbandon, findIds, onOpenId, onQuickStart, onScoreCheck,
}: Props) {
  const [showOptions, setShowOptions] = useState(false)
  /** Reshuffle was pressed while Options is open: say so, since the list it changed is behind the dialog. */
  const [reshuffled, setReshuffled] = useState(false)
  const [allSets, setAllSets] = useState(false)
  /** The first load has run past SLOW_MS. */
  const [slow, setSlow] = useState(false)
  const waiting = taxonomyLoading && !taxonomy.length
  useEffect(() => {
    if (!waiting) return
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => { window.clearTimeout(t); setSlow(false) }
  }, [waiting])
  const closeOptions = useCallback(() => { setShowOptions(false); setReshuffled(false) }, [])
  const [query, setQuery] = useState('')
  /** Hits for the needle they were found for, so a stale list never answers a newer query. */
  const [found, setFound] = useState<{ needle: string; list: SetItem[] } | null>(null)
  /** The hit Arrow keys have moved to, -1 for none. */
  const [active, setActive] = useState(-1)
  const [idOpen, setIdOpen] = useState(false)
  const idInput = useRef<HTMLInputElement>(null)
  const count = items.length
  const needle = idNeedle(query)
  const matches = needle.length >= 3 && found?.needle === needle ? found.list : null

  /** Process types, shown under a ticked skill to narrow it further. */
  const [pt, setPt] = useState<ProcessTypes | null>(null)
  useEffect(() => { void loadProcessTypes().then(setPt) }, [])
  const ptCounts = useMemo(() => (pt ? typeCounts(pt) : null), [pt])

  // ID search: look across the whole bank once the ID is long enough to mean something.
  useEffect(() => {
    setActive(-1)
    if (needle.length < 3) return
    let stale = false
    findIds(needle).then((list) => { if (!stale) setFound({ needle, list }) }).catch(() => {})
    return () => { stale = true }
  }, [needle, findIds])

  // "/" jumps to the ID search from anywhere on Home that is not a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal')) return
      e.preventDefault()
      idInput.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const shownHits = matches?.slice(0, 5) ?? []

  function submitId() {
    if (!matches?.length) return
    if (active >= 0 && shownHits[active]) { onOpenId(shownHits[active].id); return }
    // findIds puts an exact match first.
    if (matches.length === 1 || matches[0].cb_id?.toLowerCase() === needle) { onOpenId(matches[0].id); return }
    setActive(0)
  }

  function idKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setIdOpen(false); setActive(-1); return }
    if (!shownHits.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    setIdOpen(true)
    const n = shownHits.length
    setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)))
  }

  function chooseTopics() {
    const head = document.getElementById('topics-title')
    if (!head) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    head.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    head.focus({ preventScroll: true })
  }

  // The set touched most recently is the one the student means by "carry on".
  const resumable = activeSets.reduce<PracticeSet | null>(
    (best, s) => (!best || s.updated_at > best.updated_at ? s : best), null)

  const domains = useMemo(() => rollup(taxonomy, value.section).domains, [taxonomy, value.section])

  /** Which section every skill and domain code belongs to, across the whole bank. */
  const sectionOf = useMemo(() => {
    const out = new Map<string, Section>()
    for (const row of taxonomy) { out.set(row.skill, row.section); out.set(row.domain, row.section) }
    return out
  }, [taxonomy])

  /**
   * Questions per skill and per process type under the difficulty and status
   * filters, or null when neither is set (the row totals are then the answer).
   */
  const facetCounts = useMemo(() => {
    if (!facet) return null
    const out = new Map<string, number>()
    const bump = (k: string) => out.set(k, (out.get(k) ?? 0) + 1)
    for (const q of facet) {
      bump(q.skill)
      const ref = q.cb_id && pt?.q[q.cb_id]
      if (ref) bump(ref)
    }
    return out
  }, [facet, pt])
  const d1 = value.difficulties?.length === 1 ? value.difficulties[0] : null
  const s1 = value.statuses?.length === 1 ? value.statuses[0] : null
  const facetWord = d1 && !value.statuses?.length ? DIFFICULTY_NAME[d1].toLowerCase()
    : s1 && !value.difficulties?.length ? STATUS_WORD[s1] : 'match'

  const secStats = useMemo(() => rollup(taxonomy).sections, [taxonomy])

  const totals = useMemo(() => {
    const out = { all: 0, seen: 0, live: 0, RW: 0, MATH: 0 }
    for (const row of taxonomy) {
      out.all += row.n; out.seen += row.seen; out.live += row.live_n ?? 0; out[row.section] += row.n
    }
    return out
  }, [taxonomy])

  const pool = useMemo(() => {
    let done = 0, firstNew = -1
    items.forEach((q, i) => { if (q.answered_at) done++; else if (firstNew < 0) firstNew = i })
    return { done, firstNew }
  }, [items])

  function set(patch: Partial<Filters>) { onChange({ ...value, ...patch }) }

  function toggle<T>(list: T[] | undefined, item: T): T[] | undefined {
    const next = list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item]
    return next.length ? next : undefined
  }

  /**
   * The picker is a set of ticked skills. Filters AND domain with skill, so a
   * whole domain is written out as all of its skills: ticking one skill in
   * Algebra must not quietly empty a whole-ticked Geometry.
   */
  const ticked = useMemo(() => {
    if (value.skills?.length) return new Set(value.skills)
    const whole = domains.filter((d) => value.domains?.includes(d.code))
    return new Set(whole.flatMap((d) => d.skills.map((s) => s.code)))
  }, [value.skills, value.domains, domains])

  function commit(next: Set<string>) {
    const doms = domains.filter((d) => d.skills.some((s) => next.has(s.code))).map((d) => d.code)
    // Unticking a skill drops its types too, or they would linger unseen.
    const types = value.types?.filter((r) => next.has(r.slice(0, r.lastIndexOf('.'))))
    set(next.size
      ? { domains: doms, skills: [...next], types: types?.length ? types : undefined }
      : { domains: undefined, skills: undefined, types: undefined })
  }

  function tickDomain(d: DomainTally) {
    const next = new Set(ticked)
    const all = d.skills.every((s) => next.has(s.code))
    for (const s of d.skills) { if (all) next.delete(s.code); else next.add(s.code) }
    commit(next)
  }

  function tickSkill(code: string) {
    const next = new Set(ticked)
    if (next.has(code)) next.delete(code); else next.add(code)
    commit(next)
  }

  const which = value.statuses?.length ? value.statuses.join('+') : 'all'
  // The badge counts only what the bar does not show (H-35). Below 1150px the
  // bar drops its difficulty chips, so there the badge counts difficulty too.
  const hiddenCount = (value.size ? 1 : 0) + (value.size && value.speed ? 1 : 0) + (order === 'topic' ? 1 : 0)
    + (value.excludeLive ? 1 : 0) + (which !== 'all' ? 1 : 0)
  const narrowCount = hiddenCount + (value.difficulties?.length ? 1 : 0)

  const pickedSections = value.section ? [value.section]
    : [...new Set(domains.filter((d) => d.skills.some((s) => ticked.has(s.code))).map((d) => d.section))]

  /** The set clock, for the Start label. One picked section times every question at its pace (H-43). */
  const n = Math.min(value.size ?? 0, count)
  const plannedSeconds = value.size && value.speed
    ? setSeconds(Array.from({ length: n }, (_, i): Section =>
      pickedSections.length === 1 ? pickedSections[0] : i % 2 ? 'MATH' : 'RW'), value.speed)
    : 0
  /** One wording for the bar and the dialog footer. */
  const startLabel = !count && !loading ? 'Start' : !value.size ? 'Start · no limit'
    : value.speed ? `Start ${fmt(n)} · ${formatClock(plannedSeconds)}`
      : `Start ${plural(n, 'question')}`
  // A skill narrowed to types reads as those types.
  const pickedNames = domains.flatMap((d) => d.skills.filter((s) => ticked.has(s.code)).flatMap((s) => {
    const refs = value.types?.filter((r) => r.startsWith(`${s.code}.`)) ?? []
    return refs.length && pt ? refs.map((r) => pt.types[s.code]?.[r.slice(s.code.length + 1)]?.label ?? s.name) : [s.name]
  }))
  const summary = pickedNames.length ? andMore(pickedNames)
    : value.section ? `All ${SECTION_NAME[value.section]}` : 'All topics'

  /**
   * Narrow to one section, keeping the picks that belong to it. Only the other
   * section's skills, domains and types go; "All" keeps everything.
   */
  function pickSection(sec: Section | undefined) {
    if (!sec) { onChange({ ...value, section: undefined }); return }
    const keep = (code: string) => sectionOf.get(code) === sec
    const only = <T,>(list: T[] | undefined, ok: (x: T) => boolean) => {
      const next = list?.filter(ok)
      return next?.length ? next : undefined
    }
    onChange({
      ...value, section: sec,
      domains: only(value.domains, keep),
      skills: only(value.skills, keep),
      types: only(value.types, (r) => keep(r.slice(0, r.lastIndexOf('.')))),
    })
  }

  // Most recently touched first: that is the one "carry on" means.
  const setsByRecent = useMemo(
    () => [...activeSets].sort((a, b) => b.updated_at - a.updated_at), [activeSets])
  const shownSets = allSets ? setsByRecent : setsByRecent.slice(0, SETS_SHOWN)
  const hiddenSets = setsByRecent.length - shownSets.length

  async function dropSet(id: string) {
    const ok = await onAbandon(id)
    // The row and its focused button are gone: land on the next set, or the topics.
    if (ok) {
      requestAnimationFrame(() => {
        const next = document.querySelector<HTMLElement>('.qsets .setcard-main') ?? document.getElementById('topics-title')
        next?.focus()
      })
    }
    return ok
  }

  function start() {
    if (value.size) { onStart(); return }
    onOpen(pool.firstNew < 0 ? 0 : pool.firstNew)
  }

  /** Back to every question; the session length and timer are not filters, so they stay. */
  function resetFilters() {
    onChange({ size: value.size, speed: value.speed })
  }

  const tabs: { key: Section | undefined; label: string; short: string; n: number }[] = [
    { key: undefined, label: 'All', short: 'All', n: totals.all },
    { key: 'RW', label: SECTION_NAME.RW, short: SECTION_SHORT.RW, n: totals.RW },
    { key: 'MATH', label: SECTION_NAME.MATH, short: SECTION_SHORT.MATH, n: totals.MATH },
  ]

  const difficultyChips = (
    <div className="chips" role="group" aria-label="Difficulty">
      <button type="button" aria-pressed={!value.difficulties?.length}
              className={value.difficulties?.length ? 'chip' : 'chip on'}
              onClick={() => set({ difficulties: undefined })}>
        Any
      </button>
      {DIFFICULTIES.map((d) => (
        <button key={d} type="button" aria-pressed={value.difficulties?.includes(d) ?? false}
                className={value.difficulties?.includes(d) ? `chip on d-${d}` : `chip d-${d}`}
                onClick={() => set({ difficulties: toggle(value.difficulties, d) })}>
          {DIFFICULTY_NAME[d]}
        </button>
      ))}
    </div>
  )

  return (
    <div className="home">
      <section className="hero2" aria-label="Overview">
        <div className="hero2-in">
          <div className="hero2-copy">
            <Mascot className="hero2-bulb" mood="cheer" size={88} />
            <span className="hero2-eyebrow">
              {totals.all ? `${fmt(totals.all)} official questions` : 'Official questions'} · Always free
            </span>
            <h1 className="hero2-t" tabIndex={-1}>Pick a topic.<br /><span className="hero2-hl">Start drilling.</span></h1>
            <p className="hero2-sub">
              <span className="desk">Every official College Board practice question, sorted by skill. No account, no ads.</span>
              <span className="phone">Official College Board questions. Free, no account.</span>
            </p>
            <div className="hero2-go">
              {resumable ? (
                <button className="btn primary lg hero2-main" onClick={() => onResume(resumable.id)}>
                  <span className="hero2-main-t">Resume · {describeSet(resumable, false)}</span>
                  <span className="hero2-main-n">({fmt(resumable.answered)}/{fmt(resumable.total)})</span>
                  <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                </button>
              ) : (
                <button className="btn primary lg hero2-main" onClick={onQuickStart} disabled={!totals.all}>
                  <span className="desk">Start a 10-question set</span><span className="phone">Start 10 questions</span>
                  <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                </button>
              )}
              <button className="btn lg" onClick={chooseTopics}>
                <span className="desk">Choose topics</span><span className="phone">Topics</span>
              </button>
            </div>
            <form className="qsearch-f" role="search" onSubmit={(e) => { e.preventDefault(); submitId() }}>
              <label className="qsearch-l" htmlFor="qsearch">Have a question ID from a video?</label>
              <div className="qsearch">
                <Icon name="search" size={18} strokeWidth={2} />
                <input ref={idInput} id="qsearch" type="search" value={query}
                       placeholder="Question ID, e.g. d72b325e"
                       role="combobox" aria-autocomplete="list" aria-controls="idres"
                       aria-expanded={idOpen && shownHits.length > 0}
                       aria-activedescendant={idOpen && active >= 0 ? `idhit-${active}` : undefined}
                       autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
                       onChange={(e) => { setQuery(e.target.value); setIdOpen(true) }}
                       onFocus={() => setIdOpen(true)} onBlur={() => setIdOpen(false)}
                       onKeyDown={idKey} />
                <kbd className="qsearch-kbd" aria-hidden="true">/</kbd>
              </div>
              {idOpen && matches ? (
                <div className="idres">
                  {shownHits.length ? (
                    <ul id="idres" role="listbox" aria-label="Questions with this ID">
                      {shownHits.map((q, i) => (
                        // The input keeps focus (aria-activedescendant), so a press
                        // must not blur it before the click lands.
                        <li key={q.id} id={`idhit-${i}`} role="option" aria-selected={i === active}
                            className={i === active ? 'idhit on' : 'idhit'}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => onOpenId(q.id)}>
                          <code className="qid">{q.cb_id}</code>
                          <span className="idhit-s">{q.skill_name}</span>
                          <span className={`lvl d-${q.difficulty}`}>{DIFFICULTY_NAME[q.difficulty]}</span>
                          <Icon name="arrow-right" size={15} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="idnote" aria-live="polite">
                    {!matches.length
                      ? <>No question with ID “{needle}”. IDs are 8 characters, shown under Info on any question.</>
                      : matches.length > 5 ? `and ${fmt(matches.length - 5)} more, keep typing` : null}
                  </p>
                </div>
              ) : null}
            </form>
          </div>
          <ProgressStrip history={history} covered={totals.seen} total={totals.all}
                         attempts={stats?.attempts ?? 0} correct={stats?.correct ?? 0}
                         onScoreCheck={onScoreCheck} />
        </div>
      </section>

      <div className="hwrap">
        {activeSets.length ? (
          <section className="qsets" aria-labelledby="qsets-t">
            <h2 className="qsets-t" id="qsets-t">Pick up where you left off</h2>
            <ul className="setlist">
              {shownSets.map((s) => (
                <SetCard key={s.id} set={s} onOpen={() => onResume(s.id)} onDelete={() => dropSet(s.id)}
                         meta={`${fmt(s.answered)} of ${fmt(s.total)} answered`}
                         progress={s.answered / Math.max(s.total, 1)}
                         aside={<ResumeLabel />} />
              ))}
            </ul>
            {hiddenSets > 0 ? (
              <button type="button" className="link qsets-more" onClick={() => setAllSets(true)}>
                Show {fmt(hiddenSets)} more
              </button>
            ) : null}
          </section>
        ) : null}

        <div className="topics-head">
          <div className="topics-title">
            <h2 className="h1-section" id="topics-title" tabIndex={-1}>Topics</h2>
            <p className="topics-sub">
              Pick skills to build a session, or select a whole domain.{' '}
              {/* The static skill pages are the only indexable content; link them. */}
              <a className="link" href="/skills/">Browse by skill</a>
            </p>
          </div>
          <div className="seg sectabs" role="group" aria-label="Section">
            {tabs.map((t) => (
              <button key={t.label} aria-pressed={value.section === t.key}
                      className={`seg-b${t.key ? ` sec-${t.key}` : ''}${value.section === t.key ? ' on' : ''}`}
                      onClick={() => pickSection(t.key)}>
                {t.key ? <Icon name={SECTION_ICON[t.key]} size={15} strokeWidth={2} /> : null}
                <span className="long">{t.label}</span><span className="short">{t.short}</span>
              </button>
            ))}
          </div>
        </div>

        {waiting ? (
          <div className="topics-wait">
            <div className="topics-wait-msg" role="status" aria-live="polite">
              <p>Loading the question list from College Board. First visit only, about 1.5 MB.</p>
              {slow ? <p>Slow connection. This only happens once.</p> : null}
            </div>
            <div className="dgrid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="dcard dskel">
                  <span className="skel skel-t" />
                  {[0, 1, 2].map((j) => <span key={j} className="skel skel-row" />)}
                </div>
              ))}
            </div>
          </div>
        ) : !domains.length ? (
          <EmptyState mood="oops" className="topics-fail"
                      title="Couldn't reach College Board's question server"
                      body="Some school or office networks block it. Try another network, or retry."
                      action={{ label: 'Try again', onClick: onRetryBoot }} />
        ) : SECTIONS.filter((s) => !value.section || s === value.section).map((sec) => {
          const ss = secStats[sec]
          const g = graded(ss.seen, ss.correct)
          return (
            <section key={sec} className={`spanel sec-${sec}`} aria-labelledby={`spanel-${sec}`}>
              <header className="spanel-h">
                <span className="spanel-ico"><Icon name={SECTION_ICON[sec]} size={24} strokeWidth={2} /></span>
                <div className="spanel-txt">
                  <h3 className="spanel-t" id={`spanel-${sec}`}>{SECTION_NAME[sec]}</h3>
                  <p className="spanel-sub">
                    <span>{plural(ss.n, 'question')}</span> · <span>{fmt(ss.seen)} answered</span>
                  </p>
                </div>
                {g ? <span className="spanel-pct">{g.pct}<small>% correct</small></span> : null}
              </header>
              <div className="dgrid">
                {domains.filter((d) => d.section === sec).map((d) => {
                  const on = d.skills.filter((s) => ticked.has(s.code)).length
                  const state = on === 0 ? 'off' : on === d.skills.length ? 'on' : 'mixed'
                  return (
                    <article key={d.code} className={`dcard is-${state}`}>
                      <button className="dcard-h" onClick={() => tickDomain(d)}
                              role="checkbox" aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}>
                        <span className={`box is-${state}`}><Icon name="check" size={12} strokeWidth={3} /></span>
                        <span className="dcard-t">{d.name}</span>
                        <span className="dcard-stat">
                          {fmt(d.seen)} of {fmt(d.n)} answered
                          <Acc seen={d.seen} correct={d.correct} />
                        </span>
                      </button>
                      <span className="dmeter" aria-hidden="true">
                        <span style={{ transform: `scaleX(${d.n ? d.seen / d.n : 0})` }} />
                      </span>
                      <ul className="sklist">
                        {d.skills.map((s) => {
                          const sOn = ticked.has(s.code)
                          const g = graded(s.seen, s.correct)
                          const left = facetCounts ? facetCounts.get(s.code) ?? 0 : null
                          return (
                            <li key={s.code}>
                              <button className={sOn ? 'skrow on' : 'skrow'} role="checkbox" aria-checked={sOn}
                                      onClick={() => tickSkill(s.code)}>
                                <span className={`box sm is-${sOn ? 'on' : 'off'}`}>
                                  <Icon name="check" size={10} strokeWidth={3.2} />
                                </span>
                                <span className="skrow-name">{s.name}</span>
                                <span className="skrow-end">
                                  {left !== null ? <span className="skrow-f">{fmt(left)} {facetWord}</span> : null}
                                  {/* Compact on screen; spelled out for screen readers below. */}
                                  <span className="skrow-n" aria-hidden="true">
                                    {s.seen ? `${fmt(s.seen)}/${fmt(s.n)}` : fmt(s.n)}
                                  </span>
                                  <Acc seen={s.seen} correct={s.correct} />
                                </span>
                                <span className="sr-only">
                                  {`, ${fmt(s.seen)} of ${fmt(s.n)} answered`}
                                  {!s.seen ? ', not started' : g ? `, ${g.pct}% correct` : ''}
                                </span>
                                {s.seen ? (
                                  <span className="skbar" aria-hidden="true">
                                    <span style={{ transform: `scaleX(${s.seen / s.n})` }} />
                                  </span>
                                ) : null}
                              </button>
                              {sOn && pt?.types[s.code] ? (() => {
                                const types = Object.entries(pt.types[s.code])
                                const picked = types.filter(([key]) => value.types?.includes(`${s.code}.${key}`)).length
                                return (
                                  <div className="sktypes">
                                    <span className="sktypes-cap">
                                      {picked ? `${picked} of ${types.length} types` : 'All types · tap to narrow'}
                                    </span>
                                    <ul className="sktypes-list" aria-label={`${s.name}: question types`}>
                                      {types.map(([key, t]) => {
                                        const ref = `${s.code}.${key}`
                                        const tOn = value.types?.includes(ref) ?? false
                                        return (
                                          <li key={key}>
                                            <button className={tOn ? 'sktype on' : 'sktype'} role="checkbox" aria-checked={tOn}
                                                    title={t.how} onClick={() => set({ types: toggle(value.types, ref) })}>
                                              <span className={`box xs is-${tOn ? 'on' : 'off'}`}>
                                                <Icon name="check" size={9} strokeWidth={3.4} />
                                              </span>
                                              <span className="sktype-name">{t.label}</span>
                                              <span className="sktype-n">
                                                {facetCounts
                                                  ? `${fmt(facetCounts.get(ref) ?? 0)} ${facetWord}`
                                                  : ptCounts?.get(ref) ?? 0}
                                              </span>
                                            </button>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </div>
                                )
                              })() : null}
                            </li>
                          )
                        })}
                      </ul>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

      </div>

      <Footer context="home" />

      <div className="startbar2">
        <div className="startbar2-in">
          <div className="sb-sum">
            <div className="sb-line">
              {pickedSections.map((s) => <i key={s} className={`sb-dot sec-${s}`} aria-hidden="true" />)}
              <strong className="sb-name">{summary}</strong>
              {ticked.size ? (
                <button type="button" className="sb-clear" aria-label="Clear topics" title="Clear topics"
                        onClick={() => commit(new Set())}>
                  <Icon name="close" size={14} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
            {!loading && !count ? (
              <span className="sb-meta sb-none" role="status">
                <span className="sb-none-long">No questions match</span><span className="sb-none-short">No match</span>
                {' · '}
                <button type="button" className="sb-reset" onClick={resetFilters}>Reset filters</button>
              </span>
            ) : (
              <span className="sb-meta">
                {loading ? 'Counting…' : plural(count, 'question')}
                {!loading && pool.done ? ` · ${fmt(pool.done)} answered` : ''}
              </span>
            )}
          </div>
          <div className="sb-diff">{difficultyChips}</div>
          <button className="btn on-ink-secondary sb-opt" onClick={() => setShowOptions(true)}
                  aria-haspopup="dialog" aria-expanded={showOptions}>
            <Icon name="sliders" size={16} />
            <span className="sb-opt-t">Options</span>
            {hiddenCount ? <span className="opt-n wide">{hiddenCount}<span className="sr-only"> changed</span></span> : null}
            {narrowCount ? <span className="opt-n narrow">{narrowCount}<span className="sr-only"> changed</span></span> : null}
          </button>
          <button className="btn on-ink lg sb-go" disabled={!count || loading} onClick={start}>
            {startLabel}
            <Icon name="arrow-right" size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {showOptions ? (
        <Modal title="Practice options" onClose={closeOptions} className="opt-dialog" footer={<>
          <button type="button" className="btn quiet lg" onClick={closeOptions}>Done</button>
          <button type="button" className="btn primary lg" disabled={!count || loading}
                  onClick={() => { closeOptions(); start() }}>
            {loading ? 'Counting…' : startLabel}
            <Icon name="arrow-right" size={16} strokeWidth={2.2} />
          </button>
        </>}>
        <div className="opt-body">
          <fieldset className="field">
            <legend className="side-t">Difficulty</legend>
            {difficultyChips}
            <p className="field-hint">None selected means all</p>
          </fieldset>
          <div className="field">
            <label className="side-t" htmlFor="opt-show">Show</label>
            <select id="opt-show" className="sel" value={which}
                    onChange={(e) => set({ statuses: e.target.value === 'all' ? undefined : e.target.value.split('+') as Status[] })}>
              {WHICH.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </div>
          <Segmented legend="Session length" options={LENGTHS} value={value.size ?? 0}
                     onChange={(n) => set({ size: n || undefined })}
                     hint="Sets are graded at the end, like Bluebook." />
          <Segmented legend="Order" options={ORDERS} value={order === 'topic' ? 'topic' : 'shuffled'}
                     onChange={(o) => onOrder(o === 'topic' ? 'topic' : 'mixed')}
                     hint={<span aria-live="polite">{reshuffled ? 'New order, kept the same every visit' : 'Same order every visit'}</span>}
                     aside={
                       <button type="button" className="link opt-reshuffle"
                               onClick={() => { onOrder('random'); setReshuffled(true) }}>
                         <Icon name="refresh" size={14} strokeWidth={2.2} />Reshuffle
                       </button>
                     } />
          {/* Always drawn, so picking a length does not make the dialog jump (H-39). */}
          <Segmented legend="Timer" options={TIMERS} value={value.size ? value.speed ?? 0 : 0}
                     onChange={(x) => set({ speed: x || undefined })} disabled={!value.size}
                     hint={value.size ? undefined : 'Pick a session length to time it'} />
          {totals.live ? (
            <div className="field">
              <label className="excl">
                <input type="checkbox" checked={value.excludeLive ?? false} aria-describedby="opt-live-h"
                       onChange={(e) => set({ excludeLive: e.target.checked || undefined })} />
                Skip questions that appear on official practice tests
              </label>
              <p className="field-hint excl-hint" id="opt-live-h">Keeps the official practice tests fresh for later.</p>
            </div>
          ) : null}
        </div>
        </Modal>
      ) : null}
    </div>
  )
}
