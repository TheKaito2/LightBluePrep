/**
 * How the home page's question list is ordered. The practice screen walks the
 * same list, so this is also the order Back and Next follow.
 *
 *  - mixed: Options' "Shuffled". The bank's stable shuffle (what the server
 *    sends), so "question 40" means the same question every visit.
 *  - topic: "By topic". Grouped by section, domain and skill in College
 *    Board's order (lib/labels.ts), then easy to hard.
 *  - random: what "Reshuffle" picks. Still "Shuffled" to the student, just a
 *    new shuffle, fixed by `seed` (which Home stores), so coming back from a
 *    question or reloading does not reshuffle the list under you.
 */
import { byShuffleKey, shuffleKey } from './shuffle'
import { byDomain, bySkill } from './labels'
import type { SetItem } from '../types'

export type Order = 'mixed' | 'topic' | 'random'

const DIFF_RANK = { E: 0, M: 1, H: 2 } as const

export function arrange(items: readonly SetItem[], order: Order, seed = ''): SetItem[] {
  const out = [...items]
  if (order === 'topic') {
    return out.sort((a, b) =>
      // Reading and Writing first, as on the real test.
      b.section.localeCompare(a.section)
      || byDomain({ code: a.domain, name: a.domain_name }, { code: b.domain, name: b.domain_name })
      || bySkill({ code: a.skill, name: a.skill_name }, { code: b.skill, name: b.skill_name })
      || DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty]
      || byShuffleKey(a, b))
  }
  if (order === 'random') {
    return out.sort((a, b) => {
      const ka = shuffleKey(seed + a.id)
      const kb = shuffleKey(seed + b.id)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
  }
  return out.sort(byShuffleKey)
}
