import { useMemo, useState } from 'react'
import { ResumeLabel, SetCard } from '../SetCard'
import { fmt } from '../../lib/labels'
import type { PracticeSet } from '../../types'

/** Unfinished sets shown before the rest fold behind "Show N more". */
const SETS_SHOWN = 2

/** "Pick up where you left off": the unfinished sets, most recently touched first. */
export function ActiveSets({ sets, onResume, onAbandon }: {
  sets: PracticeSet[]
  onResume: (id: string) => void
  /** Resolves true once the set is deleted. */
  onAbandon: (id: string) => Promise<boolean>
}) {
  const [all, setAll] = useState(false)
  // Most recently touched first: that is the one "carry on" means.
  const byRecent = useMemo(() => [...sets].sort((a, b) => b.updated_at - a.updated_at), [sets])
  const shown = all ? byRecent : byRecent.slice(0, SETS_SHOWN)
  const hidden = byRecent.length - shown.length

  async function drop(id: string) {
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

  if (!sets.length) return null
  return (
    <section className="qsets" aria-labelledby="qsets-t">
      <h2 className="qsets-t" id="qsets-t">Pick up where you left off</h2>
      <ul className="setlist">
        {shown.map((s) => (
          <SetCard key={s.id} set={s} onOpen={() => onResume(s.id)} onDelete={() => drop(s.id)}
                   meta={`${fmt(s.answered)} of ${fmt(s.total)} answered`}
                   progress={s.answered / Math.max(s.total, 1)}
                   aside={<ResumeLabel />} />
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="link qsets-more" onClick={() => setAll(true)}>
          Show {fmt(hidden)} more
        </button>
      ) : null}
    </section>
  )
}
