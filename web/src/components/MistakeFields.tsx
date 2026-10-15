/**
 * The tags and the note, without any chrome around them.
 *
 * Two places ask why you got one wrong: the drawer in MistakeLog, and the
 * expanded row on a finished set's score screen. They want identical controls
 * in very different containers, so the controls live here and each caller
 * supplies its own wrapper.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { MISTAKE_TAGS, type Mistake, type MistakeTag } from '../types'

export const TAG_LABEL: Record<MistakeTag, string> = {
  process: 'Process',
  silly: 'Careless',
  knowledge: 'Knowledge',
  other: 'Other',
}

export const TAG_HINT: Record<MistakeTag, string> = {
  process: 'Wrong method, or the right one applied in the wrong order',
  silly: 'Knew it, slipped anyway',
  knowledge: "Didn't know the thing being tested",
  other: 'Anything else',
}

interface Props {
  mistake: Mistake | null
  /** Resolve when the store has it, to show "Saved"; reject when it failed. */
  onSave: (tags: MistakeTag[], note: string | null) => void | Promise<unknown>
  lead?: string
  /** Distinguishes the note fields when more than one is on the page. */
  id?: string
  rows?: number
  /** The fine print under the note. "Saved" replaces it for a moment after each save. */
  fine?: ReactNode
}

const SAVED_MS = 2000

export function MistakeFields({ mistake, onSave, lead, id = 'mlog-note', rows = 6, fine }: Props) {
  // Initialised from the prop and then owned locally, so callers key this by
  // question id rather than copying the prop back into state on every change.
  const [tags, setTags] = useState<MistakeTag[]>(mistake?.tags ?? [])
  const [note, setNote] = useState(mistake?.note ?? '')
  // The tag whose meaning the caption shows: the one focused or last picked.
  // The meanings used to live in title tooltips, which touch never shows.
  const [hintTag, setHintTag] = useState<MistakeTag | null>(tags.at(-1) ?? null)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<number | undefined>(undefined)

  /**
   * The latest values, plus the note the store already has.
   *
   * The note saves on blur, and React does not blur an element it unmounts, so
   * folding this section away or closing the row it sits in would drop a note
   * you had just finished typing. The cleanup below flushes it. Held in a ref
   * because that cleanup runs once, long after the render it closed over.
   */
  const live = useRef({ tags, note, saved: (mistake?.note ?? '').trim(), onSave })
  live.current.tags = tags
  live.current.note = note
  live.current.onSave = onSave

  function save(nextTags: MistakeTag[], nextNote: string) {
    live.current.saved = nextNote.trim()
    // The caller reports a failure itself; here it only means no "Saved".
    Promise.resolve(onSave(nextTags, nextNote.trim() || null)).then(() => {
      window.clearTimeout(savedTimer.current)
      setSaved(true)
      savedTimer.current = window.setTimeout(() => setSaved(false), SAVED_MS)
    }, () => {})
  }

  useEffect(() => () => {
    window.clearTimeout(savedTimer.current)
    const l = live.current
    if (l.note.trim() !== l.saved) {
      Promise.resolve(l.onSave(l.tags, l.note.trim() || null)).catch(() => {})
    }
  }, [])

  function toggle(tag: MistakeTag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    setTags(next)
    setHintTag(tag)
    save(next, note)
  }

  return (
    <>
      <p className="mlog-lead">{lead ?? 'What went wrong? Pick as many as fit.'}</p>
      <div className="chips mlog-tags">
        {MISTAKE_TAGS.map((tag) => (
          <button key={tag}
                  className={tags.includes(tag) ? 'chip on' : 'chip'}
                  aria-pressed={tags.includes(tag)}
                  aria-describedby={`${id}-hint-${tag}`}
                  onFocus={() => setHintTag(tag)}
                  onClick={() => toggle(tag)}>
            {TAG_LABEL[tag]}
            <span hidden id={`${id}-hint-${tag}`}>{TAG_HINT[tag]}</span>
          </button>
        ))}
      </div>
      {/* Hidden from screen readers: each chip carries its own hint. */}
      <p className="mlog-hint" aria-hidden="true">
        {hintTag ? <><b>{TAG_LABEL[hintTag]}:</b> {TAG_HINT[hintTag]}</> : 'Pick as many as fit.'}
      </p>

      <label className="mlog-label" htmlFor={id}>What to do next time</label>
      {/* 4000 is what the sync Worker keeps; longer would be cut silently. */}
      <textarea id={id} className="mlog-note" rows={rows} maxLength={4000}
                placeholder="e.g. re-read the question before solving"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                // Only a changed note: a blur alone is not a save to confirm.
                onBlur={() => { if (note.trim() !== live.current.saved) save(tags, note) }} />
      {fine ? (
        <p className="mlog-fine">
          {/* Only "Saved" is live; the fine print coming back is not news. */}
          <span role="status" className={saved ? 'mlog-saved' : undefined}>
            {saved ? <><Icon name="check" size={13} strokeWidth={2.6} />Saved</> : null}
          </span>
          {saved ? null : fine}
        </p>
      ) : null}
    </>
  )
}
