/**
 * Every word and order the app shows for the bank's own structure: section,
 * domain, skill and difficulty names, the answer verdicts, plurals, counts and
 * the one-line name a practice set goes by.
 *
 * One file so a page cannot drift from the others: "Reading & Writing" on one
 * screen and "Reading and Writing" on the next, or "Wrong" beside "Incorrect",
 * is what having six copies of these maps produced. Lives in lib rather than
 * beside a component because a shared helper in a component file breaks fast
 * refresh.
 */
import type { Difficulty, Filters, PracticeSet, Section, Status } from '../types'

export const SECTIONS: readonly Section[] = ['RW', 'MATH']

export const SECTION_NAME: Record<Section, string> = {
  RW: 'Reading and Writing',
  MATH: 'Math',
}

/** Only where "Reading and Writing" will not fit. */
export const SECTION_SHORT: Record<Section, string> = {
  RW: 'R&W',
  MATH: 'Math',
}

export const DIFFICULTIES: readonly Difficulty[] = ['E', 'M', 'H']

export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  E: 'Easy', M: 'Medium', H: 'Hard',
}

/** The glossary for an answer's outcome. Every screen uses these words. */
export const VERDICT = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  unanswered: 'Unanswered',
  retry: 'Correct on retry',
} as const

/**
 * The bank's domains and skills in College Board's own order, the order its
 * score reports and skill specifications use, so a student mapping their
 * report onto this site does not have to hunt. Alphabetical put Craft and
 * Structure first and Advanced Math before Algebra.
 */
const DOMAINS: { code: string; section: Section; name: string; skills: string[] }[] = [
  { code: 'INI', section: 'RW', name: 'Information and Ideas', skills: ['CID', 'COE', 'INF'] },
  { code: 'CAS', section: 'RW', name: 'Craft and Structure', skills: ['WIC', 'TSP', 'CTC'] },
  { code: 'EOI', section: 'RW', name: 'Expression of Ideas', skills: ['SYN', 'TRA'] },
  { code: 'SEC', section: 'RW', name: 'Standard English Conventions', skills: ['BOU', 'FSS'] },
  { code: 'H', section: 'MATH', name: 'Algebra', skills: ['H.A.', 'H.B.', 'H.C.', 'H.D.', 'H.E.'] },
  { code: 'P', section: 'MATH', name: 'Advanced Math', skills: ['P.A.', 'P.B.', 'P.C.'] },
  { code: 'Q', section: 'MATH', name: 'Problem-Solving and Data Analysis',
    skills: ['Q.A.', 'Q.B.', 'Q.C.', 'Q.D.', 'Q.E.', 'Q.F.', 'Q.G.'] },
  { code: 'S', section: 'MATH', name: 'Geometry and Trigonometry', skills: ['S.A.', 'S.B.', 'S.C.', 'S.D.'] },
]

export const DOMAIN_ORDER: readonly string[] = DOMAINS.map((d) => d.code)
const SKILL_ORDER: readonly string[] = DOMAINS.flatMap((d) => d.skills)

/**
 * Display names, Title Case throughout. College Board writes Reading and
 * Writing skills in Title Case and Math skills in sentence case, and spells
 * one skill both "Cross-text" and "Cross-Text"; side by side that reads as
 * unedited. Keyed by code, which never changes; slugs and filters still use
 * the code.
 */
const SKILL_NAME: Record<string, string> = {
  CID: 'Central Ideas and Details',
  COE: 'Command of Evidence',
  INF: 'Inferences',
  WIC: 'Words in Context',
  TSP: 'Text Structure and Purpose',
  CTC: 'Cross-Text Connections',
  SYN: 'Rhetorical Synthesis',
  TRA: 'Transitions',
  BOU: 'Boundaries',
  FSS: 'Form, Structure, and Sense',
  'H.A.': 'Linear Equations in One Variable',
  'H.B.': 'Linear Functions',
  'H.C.': 'Linear Equations in Two Variables',
  'H.D.': 'Systems of Two Linear Equations in Two Variables',
  'H.E.': 'Linear Inequalities in One or Two Variables',
  'P.A.': 'Equivalent Expressions',
  'P.B.': 'Nonlinear Equations in One Variable and Systems of Equations in Two Variables',
  'P.C.': 'Nonlinear Functions',
  'Q.A.': 'Ratios, Rates, Proportional Relationships, and Units',
  'Q.B.': 'Percentages',
  'Q.C.': 'One-Variable Data: Distributions and Measures of Center and Spread',
  'Q.D.': 'Two-Variable Data: Models and Scatterplots',
  'Q.E.': 'Probability and Conditional Probability',
  'Q.F.': 'Inference from Sample Statistics and Margin of Error',
  'Q.G.': 'Evaluating Statistical Claims: Observational Studies and Experiments',
  'S.A.': 'Area and Volume',
  'S.B.': 'Lines, Angles, and Triangles',
  'S.C.': 'Right Triangles and Trigonometry',
  'S.D.': 'Circles',
}

/** A skill College Board adds later keeps its own name, trimmed. */
export function skillDisplayName(code: string, name: string): string {
  return SKILL_NAME[code] ?? name.trim()
}

const rank = (order: readonly string[], code: string) => {
  const i = order.indexOf(code)
  return i < 0 ? order.length : i
}

/** Sort comparators: College Board order, then by name for codes it lacks. */
export const byDomain = (a: { code: string; name: string }, b: { code: string; name: string }) =>
  rank(DOMAIN_ORDER, a.code) - rank(DOMAIN_ORDER, b.code) || a.name.localeCompare(b.name)
export const bySkill = (a: { code: string; name: string }, b: { code: string; name: string }) =>
  rank(SKILL_ORDER, a.code) - rank(SKILL_ORDER, b.code) || a.name.localeCompare(b.name)

/** Counts as people write them: 1,107 rather than 1107. */
export function fmt(n: number): string {
  return n.toLocaleString()
}

/** The word alone, for when the number sits in its own element. */
export function noun(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

/** "1 question", "1,200 questions". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmt(n)} ${noun(n, one, many)}`
}

/** "Words in Context", or "Words in Context + 2 more". */
export function andMore(names: readonly string[]): string {
  return names.length > 1 ? `${names[0]} + ${names.length - 1} more` : names[0] ?? ''
}

const STATUS_NOTE: Record<Status, string> = {
  wrong: 'incorrect only',
  unseen: 'not answered yet',
  flagged: 'marked only',
  correct: 'correct only',
}

/**
 * What a set covers, most specific first: the skills, with a whole domain
 * read as the domain and a whole section as the section.
 */
function topic(f: Filters): string {
  const codes = f.skills ?? []
  if (!codes.length) {
    if (f.domains?.length) return andMore(f.domains.map((d) => DOMAINS.find((x) => x.code === d)?.name ?? d))
    return f.section ? SECTION_NAME[f.section] : 'All topics'
  }
  const picked = new Set(codes)
  const names: string[] = []
  let wholeSections = 0
  for (const section of SECTIONS) {
    const domains = DOMAINS.filter((d) => d.section === section)
    if (domains.every((d) => d.skills.every((s) => picked.has(s)))) {
      names.push(SECTION_NAME[section]); wholeSections++; continue
    }
    for (const d of domains) {
      if (d.skills.every((s) => picked.has(s))) names.push(d.name)
      else names.push(...d.skills.filter((s) => picked.has(s)).map((s) => SKILL_NAME[s]))
    }
  }
  if (wholeSections === SECTIONS.length) return 'All topics'
  // A skill this build does not know: the name stored with the set, if any.
  codes.forEach((c, i) => { if (!(c in SKILL_NAME)) names.push(f.skill_names?.[i] ?? c) })
  return andMore(names)
}

/**
 * The one section a set's filters keep it to, or undefined for a mixed set.
 * Picking skills on Home does not set `section`, so a Words in Context set
 * is still Reading and Writing by its skills.
 */
export function setSection(f: Filters = {}): Section | undefined {
  if (f.section) return f.section
  const codes = [...(f.domains ?? []), ...(f.skills ?? [])]
  const found = new Set(codes.map((c) => DOMAINS.find((d) => d.code === c || d.skills.includes(c))?.section))
  return found.size === 1 ? [...found][0] : undefined
}

/**
 * The one-line name a practice set goes by, e.g. "10 · Words in Context ·
 * Hard · 1.5× time".
 *
 * Built from the filters the set was created with rather than stored as text,
 * so a set from a month ago never shows a label that no longer means what it
 * says.
 */
export function describeSet(set: PracticeSet, withCount = true): string {
  const f = set.filters ?? {}
  const parts = [f.title || topic(f)]
  if (withCount) parts.unshift(fmt(set.total))
  if (f.difficulties?.length) {
    parts.push(f.difficulties.map((d) => DIFFICULTY_NAME[d]).join(' and '))
  }
  if (f.types?.length) parts.push(plural(f.types.length, 'question type'))
  if (f.statuses?.length) parts.push(f.statuses.map((s) => STATUS_NOTE[s]).join(' or '))
  if (f.excludeLive) parts.push('no practice-test questions')
  if (f.speed) parts.push(`${f.speed}× time`)
  return parts.join(' · ')
}
