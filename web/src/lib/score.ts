/**
 * The one accuracy scale every page colours by.
 *
 * Each page used to pick its own cut-offs (70/50 on Home, 80/60 on Stats,
 * 90/70 on Review and Results), so the same 60% was amber on one screen and
 * red on the next.
 */
export type Grade = 'good' | 'mid' | 'poor'

/**
 * Answers needed before an accuracy is worth a verdict. Below this one
 * unlucky question would paint a skill red, or one lucky one green.
 */
export const MIN_ANSWERS = 5

export function grade(pct: number): Grade {
  if (pct >= 75) return 'good'
  if (pct >= 50) return 'mid'
  return 'poor'
}

/** Rounded percentage and its grade, or null while there are too few answers to judge. */
export function graded(seen: number, correct: number, min = MIN_ANSWERS): { pct: number; grade: Grade } | null {
  if (seen < min || seen <= 0) return null
  const pct = Math.round((correct / seen) * 100)
  return { pct, grade: grade(pct) }
}
