/**
 * The Directions sheet under the practice title, as Bluebook has it: the
 * section's own instructions, plus the keyboard shortcuts this screen adds.
 */
import { useRef } from 'react'
import { useDialogFocus } from '../lib/useFocusTrap'

export const DIRECTIONS_ID = 'practice-directions'

/**
 * How a grid-in answer has to be typed, in our own words. Bluebook shows its
 * rules beside every student-produced response. They have to keep matching
 * what the input in QuestionView accepts: up to 5 characters (6 after a minus)
 * of digits, '.', '/' and '-'.
 */
const SPR_RULES = [
  'Positive answers can be up to 5 characters long, and negative answers up to 6, counting the minus sign.',
  'Enter a fraction such as 3/4 or a decimal such as 0.75.',
  'Mixed numbers are not accepted: enter 3 1/2 as 7/2 or 3.5.',
  'Type only digits, a decimal point, a slash and a minus sign. Leave out $, % and commas.',
  'If more than one answer is correct, enter just one of them.',
] as const

export function SprRules({ id }: { id?: string }) {
  return (
    <ul className="spr-rules" id={id}>
      {SPR_RULES.map((rule) => <li key={rule}>{rule}</li>)}
    </ul>
  )
}

export function Directions({ lines, keys, spr, onClose }: {
  lines: readonly string[]
  /** The shortcut line, which depends on whether answers are checked here. */
  keys: string
  /** The open question is a grid-in, so the entry rules belong here too. */
  spr?: boolean
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
          {spr ? (
            <>
              <h3 className="dir-sub">How to enter answers</h3>
              <SprRules />
            </>
          ) : null}
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
