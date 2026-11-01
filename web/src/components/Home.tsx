import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { Footer } from './Footer'
import { ProgressRow, ProgressStrip } from './ProgressStrip'
import { Icon } from './Icon'
import { EmptyState } from './EmptyState'
import { ActiveSets } from './home/ActiveSets'
import { DifficultyChips } from './home/DifficultyChips'
import type { TopicPicks } from './home/DomainCard'
import { Hero } from './home/Hero'
import { NextUp } from './home/NextUp'
import { OptionsDialog } from './home/OptionsDialog'
import { SectionPanel } from './home/SectionPanel'
import { StartBar } from './home/StartBar'
import { TopicsHead } from './home/TopicsHead'
import { TopicsLoading } from './home/TopicsLoading'
import { loadProcessTypes, typeCounts, type ProcessTypes } from '../lib/similar'
import { whenIdle } from '../lib/idle'
import { nextSession, type PlanSession } from '../lib/plan'
import { dayKey } from '../lib/progress'
import { closeFinishedSessions, useStudy } from '../lib/study'
import { ensureMathJax } from '../lib/mathjax'
import { setSeconds, formatClock } from '../lib/pacing'
import { DIFFICULTY_NAME, SECTIONS, SECTION_NAME, andMore, fmt, plural } from '../lib/labels'
import { rollup, type DomainTally } from '../lib/taxonomy'
import type { Order } from '../lib/order'
import type { HistoryRow } from '../lib/progress'
import type {
  Filters, PracticeSet, Section, SetItem, Status, TaxonomyRow,
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
  /** Start the balanced 20-question set that unlocks the score estimate. */
  onScoreCheck: () => void
  /** Start a plan session (App wires it to a practice set). */
  onStartPlan: (s: PlanSession) => void
  /**
   * Planning mode: the picker chooses a plan session's topics and types for
   * `date` instead of starting practice. Null in normal use.
   */
  planning: { date: string; editing: boolean } | null
  onPlanDate: (date: string) => void
  onPlanAdd: (s: Omit<PlanSession, 'id' | 'date'>, date: string) => void
  onPlanCancel: () => void
  order: Order
  onOrder: (next: Order) => void
  activeSets: PracticeSet[]
  onResume: (id: string) => void
  /** Resolves true once the set is deleted. */
  onAbandon: (id: string) => Promise<boolean>
  /** The first few questions whose College Board ID matches, exact first, and how many match. */
  findIds: (needle: string) => Promise<{ hits: SetItem[]; total: number }>
  /** Open one question on its own. */
  onOpenId: (id: string) => void
}

/** The word after a filtered count on a skill row ("87 hard"). */
const STATUS_WORD: Record<Status, string> = {
  unseen: 'not answered', wrong: 'incorrect', flagged: 'marked', correct: 'correct',
}

/**
 * Home: the hero, the topic picker, a rail of what is next and how it's going,
 * unfinished sets and the start bar. The
 * pieces live in ./home; what the picks mean (ticks, counts, the Start label)
 * is worked out here, once, and handed down.
 */
export function Home({
  taxonomy, taxonomyLoading, onRetryBoot, facet, history, value, items, loading, onChange, onOpen, onStart,
  order, onOrder, activeSets, onResume, onAbandon, findIds, onOpenId, onScoreCheck, onStartPlan,
  planning, onPlanDate, onPlanAdd, onPlanCancel,
}: Props) {
  const [showOptions, setShowOptions] = useState(false)
  const study = useStudy()
  const planNext = nextSession(study.plan, dayKey(new Date()))
  // A set finished since the last visit ticks its plan session off.
  useEffect(() => { void closeFinishedSessions().catch(() => {}) }, [])
  const closeOptions = useCallback(() => setShowOptions(false), [])
  const waiting = taxonomyLoading && !taxonomy.length
  const count = items.length

  /**
   * Process types, shown under a ticked skill to narrow it further. Fetched the
   * moment a skill is picked, or once the topics are up and the browser is
   * idle, so they never compete with the first paint (PF-18).
   */
  const [pt, setPt] = useState<ProcessTypes | null>(null)
  const narrowing = Boolean(value.skills?.length || value.types?.length)
  useEffect(() => {
    if (pt) return
    const load = () => { void loadProcessTypes().then(setPt) }
    if (narrowing) { load(); return }
    if (waiting) return
    return whenIdle(load)
  }, [pt, narrowing, waiting])
  // MathJax is fetched on first need (lib/mathjax.ts). Warm it here, after the
  // topics are on screen, so the first question with maths does not wait on it.
  useEffect(() => {
    if (waiting) return
    return whenIdle(() => { void ensureMathJax().catch(() => {}) })
  }, [waiting])
  const ptCounts = useMemo(() => (pt ? typeCounts(pt) : null), [pt])
  /** Answered questions per process type, for the progress pills under a ticked skill. */
  const [ptSeen, setPtSeen] = useState<Map<string, number> | null>(null)
  const answeredTotal = taxonomy.reduce((n, row) => n + row.seen, 0)
  useEffect(() => {
    if (!pt) return
    let stale = false
    api.questionsById().then((byId) => {
      if (stale) return
      const out = new Map<string, number>()
      for (const q of byId.values()) {
        const ref = q.answered_at && q.cb_id ? pt.q[q.cb_id] : undefined
        if (ref) out.set(ref, (out.get(ref) ?? 0) + 1)
      }
      setPtSeen(out)
    }).catch(() => { /* no pills on the types; the counts still show */ })
    return () => { stale = true }
  }, [pt, answeredTotal])

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
    const out = { all: 0, seen: 0, live: 0 }
    for (const row of taxonomy) { out.all += row.n; out.seen += row.seen; out.live += row.live_n ?? 0 }
    return out
  }, [taxonomy])

  const pool = useMemo(() => {
    let done = 0, firstNew = -1
    items.forEach((q, i) => { if (q.answered_at) done++; else if (firstNew < 0) firstNew = i })
    return { done, firstNew }
  }, [items])

  function set(patch: Partial<Filters>) { onChange({ ...value, ...patch }) }

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

  function tickType(ref: string) {
    const next = value.types?.includes(ref) ? value.types.filter((r) => r !== ref) : [...(value.types ?? []), ref]
    set({ types: next.length ? next : undefined })
  }

  const picks: TopicPicks = {
    ticked, types: value.types, pt, ptCounts, ptSeen, facetCounts, facetWord,
    onDomain: tickDomain, onSkill: tickSkill, onType: tickType,
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
      pickedSections.length === 1 ? pickedSections[0]! : i % 2 ? 'MATH' : 'RW'), value.speed)
    : 0
  /** One wording for the bar and the dialog footer. */
  const startLabel = planning
    ? (count ? `Add to plan · ${plural(value.size ? Math.min(value.size, count) : count, 'question')}` : 'Add to plan')
    : !count && !loading ? 'Start' : !value.size ? 'Start · no limit'
    : value.speed ? `Start ${fmt(n)} · ${formatClock(plannedSeconds)}`
      : `Start ${plural(n, 'question')}`
  // A skill narrowed to types reads as those types.
  const pickedNames = domains.flatMap((d) => d.skills.filter((s) => ticked.has(s.code)).flatMap((s) => {
    const refs = value.types?.filter((r) => r.startsWith(`${s.code}.`)) ?? []
    return refs.length && pt ? refs.map((r) => pt.types[s.code]?.[r.slice(s.code.length + 1)]?.label ?? s.name) : [s.name]
  }))
  /**
   * The bar's count for screen readers. Its own region because the visible
   * line swaps elements and is display:none on phones, where a live region
   * says nothing. Empty while counting, so only the settled number is read.
   */
  const countNews = loading ? '' : !count ? 'No questions match'
    : `${plural(count, 'question')}${pool.done ? `, ${fmt(pool.done)} answered` : ''}`
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

  /** The picks as a plan session: its filters, a title, and its types with their counts. */
  function asPlanSession(): Omit<PlanSession, 'id' | 'date'> {
    const names = new Map(domains.flatMap((d) => d.skills.map((k) => [k.code, k.name] as const)))
    const parts = pt && value.types?.length ? value.types.map((ref) => {
      const skill = ref.slice(0, ref.lastIndexOf('.'))
      return {
        ref, skill, skillName: names.get(skill) ?? skill,
        label: pt.types[skill]?.[ref.slice(skill.length + 1)]?.label ?? ref,
        n: items.filter((q) => q.cb_id && pt.q[q.cb_id] === ref).length,
      }
    }) : undefined
    const { title: _t, skill_names: _n, ...picks } = value
    return {
      phase: 'build', title: summary, ...(parts ? { parts } : {}),
      filters: { ...picks, size: value.size ? Math.min(value.size, count) : count },
    }
  }

  function start() {
    if (planning) { if (count) onPlanAdd(asPlanSession(), planning.date); return }
    if (value.size) { onStart(); return }
    onOpen(pool.firstNew < 0 ? 0 : pool.firstNew)
  }

  const nextUp = (
    <NextUp planNext={planNext} hasPlan={!study.loaded || Boolean(study.plan)} resumable={resumable}
            planStarted={Boolean(planNext?.session.set_id && activeSets.some((a) => a.id === planNext.session.set_id))}
            onStartPlan={onStartPlan} onResume={onResume} />
  )

  const difficulty = <DifficultyChips value={value.difficulties} onChange={(difficulties) => set({ difficulties })} />

  return (
    <div className="home">
      {planning ? null : <Hero total={totals.all} findIds={findIds} onOpenId={onOpenId} />}

      <div className="hwrap">
        {planning ? (
          <section className="plan-draft" aria-labelledby="plan-draft-t">
            <Icon name="calendar" size={20} strokeWidth={2} />
            <div className="plan-draft-txt">
              <h2 className="plan-draft-t" id="plan-draft-t">{planning.editing ? 'Changing a plan session' : 'Adding a plan session'}</h2>
              <p className="plan-draft-sub">Tick topics, and under a ticked skill its question types. Options sets the count and difficulty. Then Add to plan.</p>
            </div>
            <label className="plan-draft-day">
              <span>Day</span>
              <input type="date" className="goal-input" value={planning.date} min={dayKey(new Date())}
                     onChange={(e) => { if (e.target.value) onPlanDate(e.target.value) }} />
            </label>
            <button type="button" className="btn quiet" onClick={onPlanCancel}>Cancel</button>
          </section>
        ) : (
          // Under 1280px there is no rail beside the topics: the next step and
          // the headline numbers sit above them, the full cards below.
          <div className="hcompact">
            {nextUp}
            <ProgressRow history={history} covered={totals.seen} total={totals.all} />
          </div>
        )}

        <div className={planning ? 'hlayout solo' : 'hlayout'}>
          <div className="hmain">
            <TopicsHead section={value.section} onPick={pickSection} />

            {waiting ? <TopicsLoading /> : !domains.length ? (
              <EmptyState mood="oops" className="topics-fail"
                          title="Couldn't reach College Board's question server"
                          body="Some school or office networks block it. Try another network, or retry."
                          action={{ label: 'Try again', onClick: onRetryBoot }} />
            ) : SECTIONS.filter((s) => !value.section || s === value.section).map((sec) => (
              <SectionPanel key={sec} sec={sec} tally={secStats[sec]} picks={picks}
                            domains={domains.filter((d) => d.section === sec)} />
            ))}

            {planning ? null : <ActiveSets sets={activeSets} onResume={onResume} onAbandon={onAbandon} />}
          </div>

          {planning ? null : (
            <aside className="hrail" aria-label="Your progress">
              {nextUp}
              <ProgressStrip history={history} onScoreCheck={onScoreCheck} />
            </aside>
          )}
        </div>
      </div>

      <Footer context="home" />

      <StartBar sections={pickedSections} summary={summary} canClear={ticked.size > 0} onClear={() => commit(new Set())}
                loading={loading} count={count} done={pool.done}
                // Back to every question; the session length and timer are not filters, so they stay.
                onReset={() => onChange({ size: value.size, speed: value.speed })}
                countNews={countNews} difficulty={difficulty}
                optionsOpen={showOptions} onOptions={() => setShowOptions(true)}
                hiddenCount={hiddenCount} narrowCount={narrowCount} startLabel={startLabel} onStart={start} />

      {showOptions ? (
        <OptionsDialog value={value} onChange={set} which={which} order={order} onOrder={onOrder}
                       hasLive={totals.live > 0} difficulty={difficulty} count={count} loading={loading}
                       startLabel={startLabel} onStart={start} onClose={closeOptions} />
      ) : null}
    </div>
  )
}
