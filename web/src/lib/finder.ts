/**
 * The weakness finder: one question for every process type at every
 * difficulty, answered untimed, then read back as accuracy and time against
 * the real test's pace to rank what to fix and lay out the days to the test.
 *
 * Pure: the page (components/Finder.tsx) does the fetching and saving.
 */
import { dayKey } from './progress'
import type { ProcessTypes } from './similar'
import type { Difficulty, Filters, Section, SetItem } from '../types'

/** Every finder set's title starts with this, which is how one is recognised. */
export const FINDER_TITLE = 'Weakness finder'
/** Seconds per question the real test allows: 32 min for 27, 35 min for 22. */
export const PACE: Record<Section, number> = { RW: 71, MATH: 95 }
/** Answers needed before results mean anything. */
export const MIN_RESULTS = 20
/** A miss on a hard question costs more, as it does on an adaptive test. */
const MISS_COST: Record<Difficulty, number> = { E: 1, M: 2, H: 3 }
/** Right but slower than this many times the pace counts as half a miss. */
const SLOW = 1.5
/** ponytail: longer than this many times the pace is a break, not work, so it is capped. */
const IDLE_CAP = 3
const MAX_SET = 45
const TYPES_PER_DAY = 6
const DAYS_WITHOUT_GOAL = 14

export const isFinderSet = (s: { filters?: Filters }) => Boolean(s.filters?.title?.startsWith(FINDER_TITLE))

export interface FinderDraft { filters: Filters; ids: string[] }

function shuffled<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * The finder's sets: one question per (type, difficulty), unseen ones first,
 * grouped by domain into even sets of at most 45, Reading and Writing first.
 * `pool` should already exclude practice-test questions. The filters leave
 * that out on purpose: it would add "no practice-test questions" to every name.
 */
export function buildFinder(pool: SetItem[], pt: ProcessTypes, rand: () => number = Math.random): FinderDraft[] {
  const cells = new Map<string, SetItem[]>()
  for (const q of pool) {
    const ref = q.cb_id ? pt.q[q.cb_id] : undefined
    if (!ref) continue
    const key = `${ref}|${q.difficulty}`
    const cell = cells.get(key)
    if (cell) cell.push(q); else cells.set(key, [q])
  }
  const domains = new Map<string, SetItem[]>()
  for (const qs of cells.values()) {
    const fresh = qs.filter((q) => q.last_correct === null)
    const from = fresh.length ? fresh : qs
    const pick = from[Math.floor(rand() * from.length)]!
    const list = domains.get(pick.domain)
    if (list) list.push(pick); else domains.set(pick.domain, [pick])
  }
  const ordered = [...domains.values()].sort((a, b) =>
    (a[0]!.section === 'RW' ? 0 : 1) - (b[0]!.section === 'RW' ? 0 : 1)
    || a[0]!.domain_name.localeCompare(b[0]!.domain_name))
  const drafts: FinderDraft[] = []
  for (const picks of ordered) {
    const mixed = shuffled(picks, rand) // types and difficulties mixed, so order gives nothing away
    const parts = Math.ceil(mixed.length / MAX_SET)
    const size = Math.ceil(mixed.length / parts)
    for (let p = 0; p < parts; p++) {
      const chunk = mixed.slice(p * size, (p + 1) * size)
      const skills = [...new Map(chunk.map((q) => [q.skill, q.skill_name])).entries()].sort(([a], [b]) => a.localeCompare(b))
      const name = chunk[0]!.domain_name
      drafts.push({
        ids: chunk.map((q) => q.id),
        filters: {
          section: chunk[0]!.section,
          skills: skills.map(([code]) => code),
          skill_names: skills.map(([, n]) => n),
          size: chunk.length,
          title: `${FINDER_TITLE}: ${name}${parts > 1 ? ` (${p + 1}/${parts})` : ''}`,
        },
      })
    }
  }
  return drafts
}

/** One finder question and how it went. */
export interface FinderAnswer { q: SetItem; correct: boolean; seconds: number }

export interface FinderGroup {
  section: Section
  name: string
  n: number
  accuracy: number
  /** Average time as a multiple of the pace: 1 is on pace. */
  pace: number
  lostPerQ: number
}

export interface WeakType {
  ref: string
  label: string
  how: string
  section: Section
  skill: string
  skillName: string
  n: number
  accuracy: number
  pace: number
  lost: number
  hardMiss: number
  careless: number
  slow: number
}

export interface FinderReport {
  answered: number
  byDifficulty: FinderGroup[]
  byDomain: FinderGroup[]
  bySkill: FinderGroup[]
  /** Types that lost anything, most lost first. */
  weak: WeakType[]
}

interface Scored extends FinderAnswer { ratio: number; lost: number; slow: boolean; ref: string }

function score(a: FinderAnswer, pt: ProcessTypes): Scored {
  const pace = PACE[a.q.section]
  const ratio = Math.min(a.seconds, IDLE_CAP * pace) / pace
  const slow = a.correct && ratio > SLOW
  return {
    ...a, ratio, slow,
    lost: (a.correct ? 0 : MISS_COST[a.q.difficulty]) + (slow ? 0.5 : 0),
    ref: (a.q.cb_id && pt.q[a.q.cb_id]) || '',
  }
}

function groups(rows: Scored[], name: (r: Scored) => string, sort: 'lost' | 'name'): FinderGroup[] {
  const by = new Map<string, Scored[]>()
  for (const r of rows) {
    const k = `${r.q.section}|${name(r)}`
    const g = by.get(k)
    if (g) g.push(r); else by.set(k, [r])
  }
  const out = [...by.values()].map((rs): FinderGroup => ({
    section: rs[0]!.q.section,
    name: name(rs[0]!),
    n: rs.length,
    accuracy: rs.filter((r) => r.correct).length / rs.length,
    pace: rs.reduce((s, r) => s + r.ratio, 0) / rs.length,
    lostPerQ: rs.reduce((s, r) => s + r.lost, 0) / rs.length,
  }))
  return sort === 'lost'
    ? out.sort((a, b) => b.lostPerQ - a.lostPerQ || a.accuracy - b.accuracy)
    : out.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
}

const DIFFICULTY_ORDER: Record<Difficulty, string> = { E: '1 Easy', M: '2 Medium', H: '3 Hard' }

export function analyzeFinder(answers: FinderAnswer[], pt: ProcessTypes): FinderReport {
  const rows = answers.map((a) => score(a, pt))
  const byType = new Map<string, Scored[]>()
  for (const r of rows) {
    if (!r.ref) continue
    const g = byType.get(r.ref)
    if (g) g.push(r); else byType.set(r.ref, [r])
  }
  const weak: WeakType[] = []
  for (const [ref, rs] of byType) {
    const lost = rs.reduce((s, r) => s + r.lost, 0)
    if (lost <= 0) continue
    const dot = ref.lastIndexOf('.')
    const info = pt.types[ref.slice(0, dot)]?.[ref.slice(dot + 1)]
    const q = rs[0]!.q
    weak.push({
      ref, label: info?.label ?? ref, how: info?.how ?? '',
      section: q.section, skill: q.skill, skillName: q.skill_name,
      n: rs.length,
      accuracy: rs.filter((r) => r.correct).length / rs.length,
      pace: rs.reduce((s, r) => s + r.ratio, 0) / rs.length,
      lost,
      hardMiss: rs.filter((r) => !r.correct && r.q.difficulty === 'H').length,
      careless: rs.filter((r) => !r.correct && r.q.difficulty !== 'H').length,
      slow: rs.filter((r) => r.slow).length,
    })
  }
  weak.sort((a, b) => b.lost - a.lost || a.accuracy - b.accuracy)
  return {
    answered: rows.length,
    byDifficulty: groups(rows, (r) => DIFFICULTY_ORDER[r.q.difficulty], 'name')
      .map((g) => ({ ...g, name: g.name.slice(2) })),
    byDomain: groups(rows, (r) => r.q.domain_name, 'lost'),
    bySkill: groups(rows, (r) => r.q.skill_name, 'lost'),
    weak,
  }
}

export type PlanDayKind = 'study' | 'redo' | 'light'
export interface FinderDay { date: string; kind: PlanDayKind; types: WeakType[] }

/**
 * Days from tomorrow to the day before the test (14 days with no test date):
 * about six weak types a day, two Reading and Writing to one Math, the
 * weakest first. With three days or more, the second-last redoes misses and
 * the last is light. Types that do not fit come back in `extra`. A test date
 * with no day left before it falls back to 14 days, with `fitted` false.
 */
export function finderPlan(weak: WeakType[], testDate: string | null, now: Date = new Date()): { days: FinderDay[]; extra: WeakType[]; fitted: boolean } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = testDate ? new Date(`${testDate}T00:00:00`) : null
  const before = end ? Math.round((end.getTime() - today.getTime()) / 86_400_000) - 1 : 0
  // A test tomorrow, today or already past leaves no days before it: plan the default run instead.
  const fitted = before >= 1
  const n = fitted ? before : DAYS_WITHOUT_GOAL
  const rw = weak.filter((w) => w.section === 'RW')
  const math = weak.filter((w) => w.section === 'MATH')
  const queue: WeakType[] = []
  while (rw.length || math.length) queue.push(...rw.splice(0, 2), ...math.splice(0, 1))
  const days: FinderDay[] = []
  for (let i = 0; i < n; i++) {
    const date = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1 + i))
    const kind: PlanDayKind = n >= 3 && i === n - 1 ? 'light' : n >= 3 && i === n - 2 ? 'redo' : 'study'
    days.push({ date, kind, types: kind === 'study' ? queue.splice(0, TYPES_PER_DAY) : [] })
  }
  return { days, extra: queue, fitted }
}
