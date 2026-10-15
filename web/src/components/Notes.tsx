import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useDialogFocus } from '../lib/useFocusTrap'
import { compareAnnotations } from '../lib/ranges'
import type { Annotation } from '../types'

interface Props {
  annotations: Annotation[]
  onRemove: (id: number) => void
  onClose: () => void
}

const EXPLANATION = new Set(['why_wrong', 'why_right', 'rationale'])

const FIELD_LABEL: Record<string, string> = {
  stimulus: 'Passage',
  stem: 'Question',
}

function fieldLabel(field: string): string {
  if (FIELD_LABEL[field]) return FIELD_LABEL[field]
  if (EXPLANATION.has(field)) return 'Explanation'
  if (field.startsWith('option:')) return `Choice ${field.slice(7)}`
  return field
}

/**
 * Bluebook's Highlights & Notes panel: everything you marked on this question,
 * with its note, and a way to remove it.
 *
 * The highlighted text is read back out of the DOM rather than stored on the
 * annotation. Annotations are (field, start, end) offsets with no copy of the
 * text, and RichText already tags every rendered mark with data-ann-id, so the
 * text is a query away and there is no schema change and nothing to keep in
 * sync. It re-reads whenever the panel opens or the annotation list changes.
 * A closed explanation is not in the DOM, so its highlights say where to look
 * instead of quoting.
 *
 * Remove acts at once: the caller removes it and offers Undo in a toast.
 */
export function Notes({ annotations, onRemove, onClose }: Props) {
  const [quotes, setQuotes] = useState<Record<number, string>>({})
  const box = useRef<HTMLElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useDialogFocus(box, closeBtn)

  useEffect(() => {
    const found: Record<number, string> = {}
    for (const annotation of annotations) {
      // One annotation can be split across several marks when it spans an
      // element boundary, so join every piece back together.
      const marks = document.querySelectorAll(`mark[data-ann-id="${annotation.id}"]`)
      const text = [...marks].map((m) => m.textContent ?? '').join('').trim()
      if (text) found[annotation.id] = text
    }
    setQuotes(found)
  }, [annotations])

  const sorted = [...annotations].sort(compareAnnotations)

  return (
    <>
      <div className="nav-scrim" onClick={onClose} />
      <aside ref={box} className="notes-panel" role="dialog" aria-modal="true" aria-label="Highlights and notes">
        <div className="notes-head">
          <div className="notes-title">Highlights &amp; Notes</div>
          <button ref={closeBtn} className="nav-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {sorted.length ? (
          <ul className="notes-list">
            {sorted.map((annotation) => (
              <li key={annotation.id} className="note-item">
                <div className="note-item-head">
                  <span className={`note-swatch sw-${annotation.color}`} />
                  <span className="note-where">{fieldLabel(annotation.field)}</span>
                  <button type="button" className="note-del"
                          onClick={() => onRemove(annotation.id)}
                          aria-label="Remove highlight" title="Remove highlight">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <blockquote className="note-quote">
                  {quotes[annotation.id]
                    ? quotes[annotation.id]
                    : <em className="note-missing">
                        {EXPLANATION.has(annotation.field)
                          ? 'In the explanation (open it to see)' : 'highlighted text'}
                      </em>}
                </blockquote>
                {annotation.note ? (
                  <p className="note-text">{annotation.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="notes-empty">
            <p>Nothing marked on this question yet.</p>
            <p className="note small">
              Select any text in the passage or the question to highlight it or
              add a note.
            </p>
          </div>
        )}
      </aside>
    </>
  )
}
