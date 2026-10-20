/**
 * The study plan: dated practice sessions from today to the test.
 *
 * Pure functions, so the planner can be tested without a browser. Dates are
 * "YYYY-MM-DD" in the student's LOCAL calendar, like streaks: a session is
 * about "what do I do today" where they live. Persistence is lib/study.ts.
 *
 * The auto planner turns five answers (test date, target, days, minutes,
 * starting point, focus) and the student's own results into sessions in four
 * phases: an optional baseline, skill building, timed mixed sets, and a last
 * review of missed and marked questions. Every session is a set of Filters,
 * so starting one is the same as starting any other practice set.
 */
import { SECONDS_PER_QUESTION } from './pacing'
import { dayKey } from './progress'
import { graded } from './score'
import type { SkillTally } from './taxonomy'
import type { Filters, Section } from '../types'

export type Phase = 'baseline' | 'build' | 'mixed' | 'review'

export interface PlanSession {
  id: string
  /** "YYYY-MM-DD", local. */
  date: string
  phase: Phase
  title: string
  /** What the session practises; `size` is its question count. */
  filters: Filters
  /** The practice set started from this session, once there is one. */
  set_id?: string
  /** When it was finished (its set finished, or marked done by hand). */
  done_at?: number
  skipped?: boolean
}

export type Focus = 'auto' | Section | string[]

/** What the planner asks. A hand-built plan fills the same fields. */
export interface PlanAnswers {
  test_date: string
  target: number | null
  /** Weekdays to practise on, 0 = Sunday. */
  days: number[]
  /** Minutes per session. */
  minutes: number
  start_from: 'estimate' | 'score_check' | 'known'
  known?: { rw: number; math: number }
  /** Let the plan decide, one section, or chosen domain codes. */
  focus: Focus
}

export interface Plan extends PlanAnswers {
  sessions: PlanSession[]
  created_at: number
  source: 'auto' | 'manual'
}

/**
 * SAT weekend dates from College Board's dates page (checked 2026-10-20). The
 * 2027-28 dates are College Board's "anticipated" list, so they are marked.
 */
export const SAT_DATES: readonly { date: string; expected?: boolean }[] = [
  { date: '2026-11-07' }, { date: '2026-12-05' }, { date: '2027-03-06' },
  { date: '2027-05-01' }, { date: '2027-06-05' },
  { date: '2027-08-28', expected: true }, { date: '2027-09-18', expected: true },
  { date: '2027-10-09', expected: true }, { date: '2027-11-06', expected: true },
  { date: '2027-12-04', expected: true },
]

/**
 * Share of each section's questions per domain on the real test (College
 * Board's test specifications), which is how much a domain is worth drilling.
 */
export const DOMAIN_WEIGHT: Record<string, number> = {
  INI: 0.26, CAS: 0.28, EOI: 0.20, SEC: 0.26,
  H: 0.35, P: 0.35, Q: 0.15, S: 0.15,
}

export const MINUTES = [15, 30, 45, 60] as const

/** A date-only string with a time is read as LOCAL midnight; without one, as UTC. */
const parseDay = (s: string) => new Date(`${s}T00:00:00`)
const addDays = (s: string, n: number) => {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

/**
 * Every practice day from `today` up to, but not including, the day before the
 * test: no session on the eve or the morning of it.
 */
export function sessionDates(today: string, testDate: string, days: readonly number[]): string[] {
  const out: string[] = []
  const last = addDays(testDate, -2)
  for (let d = today; d <= last; d = addDays(d, 1)) {
    if (days.includes(parseDay(d).getDay())) out.push(d)
  }
  return out
}

/**
 * Questions that fit in `minutes`, at the real test's average pace plus half
 * again for reading the explanations, rounded to 5 and kept between 5 and 40.
 */
export function questionsFor(minutes: number): number {
  const pace = (SECONDS_PER_QUESTION.RW + SECONDS_PER_QUESTION.MATH) / 2 * 1.5
  return Math.min(40, Math.max(5, Math.round((minutes * 60) / pace / 5) * 5))
}

/** How many sessions each phase gets out of `n`. */
export function phaseCounts(n: number, baseline: boolean): Record<Phase, number> {
  if (n <= 0) return { baseline: 0, build: 0, mixed: 0, review: 0 }
  if (n < 5) {
    // Too close to build skills: timed mixed sets, then one review if there is room.
    const review = n >= 2 ? 1 : 0
    return { baseline: 0, build: 0, mixed: n - review, review }
  }
  const b = baseline ? 1 : 0
  const review = n >= 10 ? 2 : 1
  const rest = n - b - review
  const mixed = Math.round(rest * 0.3)
  return { baseline: b, build: rest - mixed, mixed, review }
}

/**
 * Each section's share of the practice: by how far it sits below half the
 * target, kept between 30% and 70% so neither is ever dropped. Even without a
 * target or a score to measure from.
 */
export function sectionShares(
  target: number | null, score: { rw: number; math: number } | null, focus: Focus,
): Record<Section, number> {
  if (focus === 'RW') return { RW: 1, MATH: 0 }
  if (focus === 'MATH') return { RW: 0, MATH: 1 }
  if (!target || !score) return { RW: 0.5, MATH: 0.5 }
  const gap = { RW: Math.max(0, target / 2 - score.rw), MATH: Math.max(0, target / 2 - score.math) }
  const sum = gap.RW + gap.MATH
  if (!sum) return { RW: 0.5, MATH: 0.5 }
  const rw = Math.min(0.7, Math.max(0.3, gap.RW / sum))
  return { RW: rw, MATH: 1 - rw }
}

/**
 * How much a skill deserves practice: its domain's weight on the test, shared
 * among the domain's skills, times how weak it is (unknown counts as middling),
 * times how much of it is still unseen (a finished skill still gets a little).
 */
export function skillPriority(k: SkillTally, skillsInDomain: number): number {
  const g = graded(k.seen, k.correct)
  const weakness = g ? 1 - g.pct / 100 : 0.5
  const unseen = k.n ? 1 - k.seen / k.n : 0
  return ((DOMAIN_WEIGHT[k.domain] ?? 0.2) / Math.max(1, skillsInDomain))
    * (0.15 + weakness) * (0.25 + 0.75 * unseen)
}

/**
 * Split `count` sessions across `skills` by priority (largest remainder), then
 * order them round-robin so the same skill never comes twice in a row while
 * another is waiting.
 */
function allocate(skills: readonly SkillTally[], count: number): SkillTally[] {
  if (!count || !skills.length) return []
  const perDomain = new Map<string, number>()
  for (const k of skills) perDomain.set(k.domain, (perDomain.get(k.domain) ?? 0) + 1)
  const weighted = skills.map((k) => ({ k, w: skillPriority(k, perDomain.get(k.domain) ?? 1) }))
  const total = weighted.reduce((s, x) => s + x.w, 0) || 1
  const shares = weighted.map((x) => ({ ...x, exact: (x.w / total) * count }))
  const take = shares.map((x) => ({ ...x, n: Math.floor(x.exact) }))
  let left = count - take.reduce((s, x) => s + x.n, 0)
  for (const x of [...take].sort((a, b) => (b.exact - b.n) - (a.exact - a.n))) {
    if (left <= 0) break
    x.n++; left--
  }
  const queue = take.filter((x) => x.n > 0).sort((a, b) => b.w - a.w)
  const out: SkillTally[] = []
  while (queue.some((x) => x.n > 0)) {
    for (const x of queue) if (x.n > 0) { out.push(x.k); x.n-- }
  }
  return out
}

/** Merge per-section lists, taking next from whichever is furthest behind its share. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const aBehind = j >= b.length || (i < a.length && i / a.length <= j / b.length)
    if (aBehind) out.push(a[i++]!)
    else out.push(b[j++]!)
  }
  return out
}

export interface PlanContext {
  today: string
  /** Every skill with its tallies (rollup(taxonomy).skills). */
  skills: readonly SkillTally[]
  /** The unlocked estimate per section, or null. */
  estimate: { rw: number; math: number } | null
  now?: number
  /** Stable ids in tests. */
  newId?: () => string
}

/** The auto planner: answers and results in, a dated plan out. */
export function buildPlan(answers: PlanAnswers, ctx: PlanContext): Plan {
  const newId = ctx.newId ?? (() => crypto.randomUUID())
  const dates = sessionDates(ctx.today, answers.test_date, answers.days)
  const size = questionsFor(answers.minutes)
  const counts = phaseCounts(dates.length, answers.start_from === 'score_check' && !ctx.estimate)
  const score = answers.start_from === 'known' ? answers.known ?? null : ctx.estimate
  const shares = sectionShares(answers.target, score, answers.focus)

  const inFocus = (k: SkillTally) => (Array.isArray(answers.focus)
    ? answers.focus.includes(k.domain)
    : answers.focus === 'auto' || answers.focus === k.section)
  const skills = ctx.skills.filter(inFocus)
  // A domain focus picks the sections by which domains were chosen.
  const sectionsInPlay = (['RW', 'MATH'] as Section[]).filter((s) => skills.some((k) => k.section === s))
  const shareOf = (s: Section) => {
    if (!sectionsInPlay.includes(s)) return 0
    return sectionsInPlay.length === 1 ? 1 : shares[s]
  }

  const rwBuild = Math.round(counts.build * shareOf('RW'))
  const build = interleave(
    allocate(skills.filter((k) => k.section === 'RW'), rwBuild),
    allocate(skills.filter((k) => k.section === 'MATH'), counts.build - rwBuild),
  ).map((k): Omit<PlanSession, 'id' | 'date'> => ({
    phase: 'build',
    title: k.name,
    filters: { section: k.section, skills: [k.code], size },
  }))

  const rwMixed = Math.round(counts.mixed * shareOf('RW'))
  const mixed = interleave(
    Array.from({ length: rwMixed }, () => 'RW' as Section),
    Array.from({ length: counts.mixed - rwMixed }, () => 'MATH' as Section),
  ).map((s): Omit<PlanSession, 'id' | 'date'> => ({
    phase: 'mixed',
    title: s === 'RW' ? 'Timed mix: Reading and Writing' : 'Timed mix: Math',
    filters: { section: s, size, speed: 1 },
  }))

  const plan: Omit<PlanSession, 'id' | 'date'>[] = [
    ...Array.from({ length: counts.baseline }, () => ({
      phase: 'baseline' as const, title: 'Score check', filters: { size: 20 },
    })),
    ...build,
    ...mixed,
    ...Array.from({ length: counts.review }, () => ({
      phase: 'review' as const,
      title: 'Review your misses',
      filters: { statuses: ['wrong', 'flagged'], size } as Filters,
    })),
  ]

  return {
    ...answers,
    sessions: plan.map((s, i) => ({ ...s, id: newId(), date: dates[i]! })),
    created_at: ctx.now ?? Date.now(),
    source: 'auto',
  }
}

const pending = (s: PlanSession) => !s.done_at && !s.skipped

/** Sessions on days already gone that were neither done nor skipped. */
export const missed = (plan: Plan, today: string) =>
  plan.sessions.filter((s) => s.date < today && pending(s))

/**
 * Move every undone session from a past day onto the next free practice days,
 * in order, followed by the sessions already ahead. Done and skipped sessions
 * keep their dates. When the days left before the test cannot hold them all,
 * the latest skill-building sessions go first, then the mixed ones: the review
 * at the end is the last thing to give up.
 */
export function reflow(plan: Plan, today: string): Plan {
  if (plan.source === 'manual') return reflowMissed(plan, today)
  const kept = plan.sessions.filter((s) => !pending(s))
  const queue = plan.sessions.filter(pending).sort((a, b) => a.date.localeCompare(b.date))
  const taken = new Set(kept.filter((s) => s.date >= today).map((s) => s.date))
  const slots = sessionDates(today, plan.test_date, plan.days.length ? plan.days : [0, 1, 2, 3, 4, 5, 6])
    .filter((d) => !taken.has(d))
  for (const phase of ['build', 'mixed', 'baseline', 'review'] as Phase[]) {
    while (queue.length > slots.length) {
      const at = queue.map((s) => s.phase).lastIndexOf(phase)
      if (at < 0) break
      queue.splice(at, 1)
    }
  }
  const moved = queue.slice(0, slots.length).map((s, i) => ({ ...s, date: slots[i]! }))
  return { ...plan, sessions: [...kept, ...moved].sort((a, b) => a.date.localeCompare(b.date)) }
}

/**
 * A hand-built plan's days were chosen one by one, so only the missed sessions
 * move: each to the next day from today with no session on it, before the
 * test. One with no free day left stays where it was, still marked missed.
 */
function reflowMissed(plan: Plan, today: string): Plan {
  const taken = new Set(plan.sessions.filter((s) => s.date >= today).map((s) => s.date))
  const free = sessionDates(today, plan.test_date, plan.days.length ? plan.days : [0, 1, 2, 3, 4, 5, 6])
    .filter((d) => !taken.has(d))
  const late = missed(plan, today).sort((a, b) => a.date.localeCompare(b.date))
  const moved = new Map(late.slice(0, free.length).map((s, i) => [s.id, free[i]!]))
  return {
    ...plan,
    sessions: plan.sessions.map((s) => (moved.has(s.id) ? { ...s, date: moved.get(s.id)! } : s))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** Today's session, else the next one ahead, with which it is. */
export function nextSession(plan: Plan | null, today: string): { session: PlanSession; today: boolean } | null {
  if (!plan) return null
  const ahead = plan.sessions
    .filter((s) => s.date >= today && pending(s))
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  return ahead ? { session: ahead, today: ahead.date === today } : null
}

/**
 * Close the sessions whose practice set is finished. Returns the same object
 * when nothing changed, so a caller can skip the save.
 */
export function markFinished(plan: Plan, finishedAt: ReadonlyMap<string, number>): Plan {
  let changed = false
  const sessions = plan.sessions.map((s) => {
    const at = s.set_id && !s.done_at ? finishedAt.get(s.set_id) : undefined
    if (!at) return s
    changed = true
    return { ...s, done_at: at }
  })
  return changed ? { ...plan, sessions } : plan
}

/** Done, and the total, for the header. Skipped sessions count as neither. */
export function planProgress(plan: Plan): { done: number; total: number } {
  const live = plan.sessions.filter((s) => !s.skipped)
  return { done: live.filter((s) => s.done_at).length, total: live.length }
}

/** An empty plan to build by hand. */
export function blankPlan(answers: PlanAnswers, now = Date.now()): Plan {
  return { ...answers, sessions: [], created_at: now, source: 'manual' }
}

export const PHASE_NAME: Record<Phase, string> = {
  baseline: 'Starting point', build: 'Build skills', mixed: 'Timed practice', review: 'Final review',
}

/** Add a session, or replace the one with its id; kept in date order. */
export function putSession(plan: Plan, session: PlanSession): Plan {
  const rest = plan.sessions.filter((s) => s.id !== session.id)
  return { ...plan, sessions: [...rest, session].sort((a, b) => a.date.localeCompare(b.date)) }
}

export function removeSession(plan: Plan, id: string): Plan {
  return { ...plan, sessions: plan.sessions.filter((s) => s.id !== id) }
}

export function patchSession(plan: Plan, id: string, patch: Partial<PlanSession>): Plan {
  return { ...plan, sessions: plan.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
}

/** Monday of the week `date` falls in, for grouping the list. */
export function weekOf(date: string): string {
  const d = parseDay(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(d)
}
