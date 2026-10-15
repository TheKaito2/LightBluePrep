import { DIFFICULTIES, DIFFICULTY_NAME } from '../../lib/labels'
import type { Difficulty } from '../../types'

/** "Any" plus one toggle per difficulty. Shared by the start bar and the Options dialog. */
export function DifficultyChips({ value, onChange }: {
  value: Difficulty[] | undefined
  /** Undefined when none is picked, which means any. */
  onChange: (next: Difficulty[] | undefined) => void
}) {
  function toggle(d: Difficulty) {
    const next = value?.includes(d) ? value.filter((x) => x !== d) : [...(value ?? []), d]
    onChange(next.length ? next : undefined)
  }
  return (
    <div className="chips" role="group" aria-label="Difficulty">
      <button type="button" aria-pressed={!value?.length}
              className={value?.length ? 'chip' : 'chip on'}
              onClick={() => onChange(undefined)}>
        Any
      </button>
      {DIFFICULTIES.map((d) => (
        <button key={d} type="button" aria-pressed={value?.includes(d) ?? false}
                className={value?.includes(d) ? `chip on d-${d}` : `chip d-${d}`}
                onClick={() => toggle(d)}>
          {DIFFICULTY_NAME[d]}
        </button>
      ))}
    </div>
  )
}
