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

export type Phase = 'baseline' | 'build' | 'mixed' | 'review' | 'cover'

/** One process type inside a session: which, and how many of its questions. */
export interface PlanPart {
  /** "skill.key", as in process-types.json. */
  ref: string
  label: string
  skill: string
  skillName: string
  n: number
}

export interface PlanSession {
  id: string
  /** "YYYY-MM-DD", local. */
  date: string
  phase: Phase
  title: string
  /** What the session practises; `size` is its question count. */
  filters: Filters
  /** The process types it covers, in order, when it was planned that finely. */
  parts?: PlanPart[]
  /** The practice set started from this session, once there is one. */
  set_id?: string
  /** When it was finished (its set finished, or marked done by hand). */
  done_at?: number
  skipped?: boolean
}

export type Focus = 'auto' | Section | string[]

/** What the planner asks. A hand-built plan fills the same fields. */
export interface PlanAnswers {
  /** Practise weak skills (the default), or clear every question in the bank. */
  mode?: 'skills' | 'cover'
  test_date: string
  target: number | null
  /** Weekdays to practise on, 0 = Sunday. Derived from `weights` when those are set. */
  days: number[]
  /**
   * How much each weekday carries, index 0 = Sunday: 0 off, 0.5 light, 1 normal,
   * 2 heavy. Plans from before this existed have none: 1 on each of `days`.
   */
  weights?: number[]
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

/** Ready-made weekday weights, index 0 = Sunday. */
export const WEIGHT_PRESETS: readonly { key: string; label: string; weights: number[] }[] = [
  { key: 'even', label: 'Every day the same', weights: [1, 1, 1, 1, 1, 1, 1] },
  { key: 'weekends', label: 'Weekends ×2', weights: [2, 1, 1, 1, 1, 1, 2] },
  { key: 'weekends-tue', label: 'Weekends ×2, Tuesday ½', weights: [2, 1, 0.5, 1, 1, 1, 2] },
]

/** Each weekday's weight, from `weights` or, for an older plan, 1 on each of `days`. */
export function weightsOf(a: Pick<PlanAnswers, 'days' | 'weights'>): number[] {
  if (a.weights?.length === 7) return a.weights
  return [0, 1, 2, 3, 4, 5, 6].map((d) => (a.days.includes(d) ? 1 : 0))
}

/** The weekdays with any weight. */
export const daysFrom = (weights: readonly number[]) =>
  weights.flatMap((w, d) => (w > 0 ? [d] : []))

/**
 * Split `total` questions over `dates` in proportion to each date's weekday
 * weight. Largest remainder, so the quotas add up to exactly `total`.
 */
export function dayQuotas(dates: readonly string[], weights: readonly number[], total: number): number[] {
  const w = dates.map((d) => weights[parseDay(d).getDay()] ?? 0)
  const sum = w.reduce((a, b) => a + b, 0)
  if (!sum || total <= 0) return dates.map(() => 0)
  const exact = w.map((x) => (x / sum) * total)
  const out = exact.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - out[i]!, i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]!++; left--
  }
  return out
}

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
export function phaseCounts(n: number, baseline: boolean): Record<Exclude<Phase, 'cover'>, number> {
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
  const weights = weightsOf(answers)
  const dates = sessionDates(ctx.today, answers.test_date, daysFrom(weights))
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

  // A heavy day gets a longer session and a light one a shorter one; the score
  // check stays 20 so it measures the same thing whatever the day.
  const scaled = (s: Omit<PlanSession, 'id' | 'date'>, date: string): Omit<PlanSession, 'id' | 'date'> => {
    const w = weights[parseDay(date).getDay()] ?? 1
    if (s.phase === 'baseline' || w === 1) return s
    return { ...s, filters: { ...s.filters, size: Math.min(80, Math.max(5, Math.round((size * w) / 5) * 5)) } }
  }
  return {
    ...answers,
    mode: 'skills',
    weights,
    days: daysFrom(weights),
    sessions: plan.map((s, i) => ({ ...scaled(s, dates[i]!), id: newId(), date: dates[i]! })),
    created_at: ctx.now ?? Date.now(),
    source: 'auto',
  }
}

/** One process type in the bank, in the order the cover plan works through them. */
export interface TypeSlot { ref: string; label: string; skill: string; skillName: string; section: Section }

export interface CoverContext {
  today: string
  /** Every process type, in test order: section, domain, skill, then type. */
  types: readonly TypeSlot[]
  /** Questions not answered yet, per type ref. */
  unseen: ReadonlyMap<string, number>
  now?: number
  newId?: () => string
}

/** "Algebra · 3 types", or "Central Ideas and Details + 2 more skills · 9 types". */
function coverTitle(parts: readonly PlanPart[]): string {
  const skills = [...new Set(parts.map((p) => p.skill))]
  const first = parts[0]!.skillName
  const more = skills.length > 1 ? ` + ${skills.length - 1} more ${skills.length === 2 ? 'skill' : 'skills'}` : ''
  return `${first}${more} · ${parts.length} ${parts.length === 1 ? 'type' : 'types'}`
}

/**
 * Clear every question: all the unanswered questions, type by type in test
 * order, spread over the practice days by weekday weight (dayQuotas). A type
 * that does not fit in what is left of a day carries on into the next one.
 * Each session asks for unseen questions of its types, so doing a day early,
 * late or twice still works through the bank rather than repeating it.
 */
export function coverPlan(answers: PlanAnswers, ctx: CoverContext): Plan {
  const newId = ctx.newId ?? (() => crypto.randomUUID())
  const weights = weightsOf(answers)
  const dates = sessionDates(ctx.today, answers.test_date, daysFrom(weights))
  const queue = ctx.types
    .map((t) => ({ ...t, left: ctx.unseen.get(t.ref) ?? 0 }))
    .filter((t) => t.left > 0)
  const total = queue.reduce((a, t) => a + t.left, 0)
  const quotas = dayQuotas(dates, weights, total)

  const sessions: PlanSession[] = []
  let q = 0
  dates.forEach((date, i) => {
    let room = quotas[i]!
    const parts: PlanPart[] = []
    while (room > 0 && q < queue.length) {
      const t = queue[q]!
      const take = Math.min(room, t.left)
      parts.push({ ref: t.ref, label: t.label, skill: t.skill, skillName: t.skillName, n: take })
      t.left -= take
      room -= take
      if (!t.left) q++
    }
    if (!parts.length) return
    const sections = new Set(parts.map((p) => queue.find((t) => t.ref === p.ref)?.section))
    sessions.push({
      id: newId(),
      date,
      phase: 'cover',
      title: coverTitle(parts),
      parts,
      filters: {
        ...(sections.size === 1 ? { section: [...sections][0] } : {}),
        skills: [...new Set(parts.map((p) => p.skill))],
        types: parts.map((p) => p.ref),
        statuses: ['unseen'],
        size: parts.reduce((a, p) => a + p.n, 0),
      },
    })
  })

  return {
    ...answers,
    mode: 'cover',
    weights,
    days: daysFrom(weights),
    sessions,
    created_at: ctx.now ?? Date.now(),
    source: 'auto',
  }
}

/**
 * Every process type in test order, for coverPlan: skills as `skills` lists
 * them (rollup order), each skill's types in the order the file gives.
 */
export function typeSlots(
  skills: readonly { code: string; name: string; section: Section }[],
  types: Record<string, Record<string, { label: string }>>,
): TypeSlot[] {
  return skills.flatMap((k) => Object.entries(types[k.code] ?? {}).map(([key, t]) => ({
    ref: `${k.code}.${key}`, label: t.label, skill: k.code, skillName: k.name, section: k.section,
  })))
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
  if (plan.mode === 'cover') return reflowCover(plan, today)
  const kept = plan.sessions.filter((s) => !pending(s))
  const queue = plan.sessions.filter(pending).sort((a, b) => a.date.localeCompare(b.date))
  const taken = new Set(kept.filter((s) => s.date >= today).map((s) => s.date))
  const days = daysFrom(weightsOf(plan))
  const slots = sessionDates(today, plan.test_date, days.length ? days : [0, 1, 2, 3, 4, 5, 6])
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
  const days = daysFrom(weightsOf(plan))
  const free = sessionDates(today, plan.test_date, days.length ? days : [0, 1, 2, 3, 4, 5, 6])
    .filter((d) => !taken.has(d))
  const late = missed(plan, today).sort((a, b) => a.date.localeCompare(b.date))
  const moved = new Map(late.slice(0, free.length).map((s, i) => [s.id, free[i]!]))
  return {
    ...plan,
    sessions: plan.sessions.map((s) => (moved.has(s.id) ? { ...s, date: moved.get(s.id)! } : s))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/**
 * A cover plan already fills every practice day, so missed questions cannot
 * move to a free day: everything not yet done is spread again over the days
 * left, by the same weights and in the same type order.
 */
function reflowCover(plan: Plan, today: string): Plan {
  const kept = plan.sessions.filter((s) => !pending(s) || s.phase !== 'cover')
  const open = plan.sessions.filter((s) => pending(s) && s.phase === 'cover')
    .sort((a, b) => a.date.localeCompare(b.date))
  // Whole parts in order; a type split over two days joins back up.
  const parts: PlanPart[] = []
  for (const p of open.flatMap((s) => s.parts ?? [])) {
    const last = parts[parts.length - 1]
    if (last && last.ref === p.ref) last.n += p.n
    else parts.push({ ...p })
  }
  const weights = weightsOf(plan)
  const dates = sessionDates(today, plan.test_date, daysFrom(weights))
  const total = parts.reduce((a, p) => a + p.n, 0)
  const quotas = dayQuotas(dates, weights, total)
  const sessions: PlanSession[] = []
  let at = 0
  dates.forEach((date, i) => {
    let room = quotas[i]!
    const day: PlanPart[] = []
    while (room > 0 && at < parts.length) {
      const p = parts[at]!
      const take = Math.min(room, p.n)
      day.push({ ...p, n: take })
      p.n -= take
      room -= take
      if (!p.n) at++
    }
    if (!day.length) return
    const reuse = open[sessions.length]
    sessions.push({
      id: reuse?.id ?? crypto.randomUUID(),
      date,
      phase: 'cover',
      title: coverTitle(day),
      parts: day,
      filters: {
        skills: [...new Set(day.map((p) => p.skill))],
        types: day.map((p) => p.ref),
        statuses: ['unseen'],
        size: day.reduce((a, p) => a + p.n, 0),
      },
    })
  })
  return { ...plan, sessions: [...kept, ...sessions].sort((a, b) => a.date.localeCompare(b.date)) }
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
  cover: 'Clear the bank',
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
