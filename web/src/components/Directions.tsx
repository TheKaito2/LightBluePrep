/**
 * The Directions sheet under the practice title, as Bluebook has it: the
 * section's own instructions, plus the keyboard shortcuts this screen adds.
 */
import { useRef } from 'react'
import { useDialogFocus } from '../lib/useFocusTrap'

export const DIRECTIONS_ID = 'practice-directions'

export function Directions({ lines, keys, onClose }: {
  lines: readonly string[]
  /** The shortcut line, which depends on whether answers are checked here. */
  keys: string
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useDialogFocus(box, closeBtn)

  return (
    <>
      <div className="dir-scrim" onClick={onClose} />
      <div ref={box} id={DIRECTIONS_ID} className="dir-sheet"
           role="dialog" aria-modal="true" aria-label="Directions">
        <div className="dir-body">
          {lines.map((line) => <p key={line}>{line}</p>)}
          <p className="dir-keys">{keys}</p>
        </div>
        <div className="dir-foot">
          <button ref={closeBtn} className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}
