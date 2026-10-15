/**
 * Roll the per-difficulty taxonomy rows up into sections, domains, skills and
 * difficulties. Home's topic picker and the Stats page both read from this,
 * so their counts can never disagree.
 */
import { SECTIONS, byDomain, bySkill } from './labels'
import { MIN_ANSWERS, graded } from './score'
import type { Difficulty, Section, TaxonomyRow } from '../types'

export interface Tally { n: number; seen: number; correct: number }

export interface SkillTally extends Tally {
  code: string; name: string; section: Section; domain: string; domainName: string
}

export interface DomainTally extends Tally {
  code: string; name: string; section: Section
  /** In the official skill order. */
  skills: SkillTally[]
}

export interface Rollup {
  total: Tally
  sections: Record<Section, Tally>
  /** Sections in test order, then the official domain order. */
  domains: DomainTally[]
  /** Every skill, in the same order as `domains` lists them. */
  skills: SkillTally[]
  difficulty: Record<Difficulty, Tally>
}

const tally = (): Tally => ({ n: 0, seen: 0, correct: 0 })
const add = (into: Tally, row: Tally) => {
  into.n += row.n; into.seen += row.seen; into.correct += row.correct
}

/** Roll up `rows`, keeping only one section's when `section` is given. */
export function rollup(rows: readonly TaxonomyRow[], section?: Section): Rollup {
  const total = tally()
  const sections = { RW: tally(), MATH: tally() }
  const difficulty: Record<Difficulty, Tally> = { E: tally(), M: tally(), H: tally() }
  // Keyed by section too: a domain or skill code is only unique within one.
  const domains = new Map<string, DomainTally>()
  const skills = new Map<string, SkillTally>()

  for (const row of rows) {
    if (section && row.section !== section) continue
    add(total, row)
    add(sections[row.section], row)
    // A row with no difficulty still counts everywhere else.
    if (row.difficulty in difficulty) add(difficulty[row.difficulty], row)

    const dKey = `${row.section}|${row.domain}`
    let d = domains.get(dKey)
    if (!d) {
      d = { ...tally(), code: row.domain, name: row.domain_name, section: row.section, skills: [] }
      domains.set(dKey, d)
    }
    add(d, row)

    const kKey = `${dKey}|${row.skill}`
    let k = skills.get(kKey)
    if (!k) {
      k = {
        ...tally(), code: row.skill, name: row.skill_name, section: row.section,
        domain: row.domain, domainName: row.domain_name,
      }
      skills.set(kKey, k)
      d.skills.push(k)
    }
    add(k, row)
  }

  const domainList = [...domains.values()].sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || byDomain(a, b))
  for (const d of domainList) d.skills.sort(bySkill)

  return {
    total, sections, difficulty, domains: domainList, skills: domainList.flatMap((d) => d.skills),
  }
}

/**
 * The skills worth drilling: enough answers that the weakness is real, and
 * accuracy below the "good" grade. Ranked by questions lost, so a skill you
 * missed 6 of 12 in outranks one you missed 3 of 5, then by accuracy.
 */
export function focusSkills<T extends Tally>(skills: readonly T[], min = MIN_ANSWERS, max = 5): T[] {
  return skills
    .filter((k) => {
      const g = graded(k.seen, k.correct, min)
      return g !== null && g.grade !== 'good'
    })
    .sort((a, b) => (b.seen - b.correct) - (a.seen - a.correct) || a.correct / a.seen - b.correct / b.seen)
    .slice(0, max)
}
