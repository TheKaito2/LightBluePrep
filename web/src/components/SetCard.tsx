/**
 * One practice set as a list row: unfinished sets on Home, finished ones on
 * Review. The whole row opens the set, so the label saying what a click does
 * ("Resume", or the score) sits inside that one button; delete is the only
 * other target, and it asks first.
 */
import type { ReactNode } from 'react'
import { ConfirmDelete } from './ConfirmDelete'
import { Icon } from './Icon'
import { describeSet } from '../lib/labels'
import type { PracticeSet } from '../types'

interface Props {
  set: PracticeSet
  /** The line under the title, e.g. "4 of 10 answered" or the date. */
  meta: ReactNode
  /** Share answered, 0 to 1. Draws the meter; leave out for finished sets. */
  progress?: number
  /** Right-hand label inside the open button: the score, or a Resume look-alike. */
  aside?: ReactNode
  onOpen: () => void
  /** Resolves true once the set is gone; the row stays put until then. */
  onDelete: () => Promise<boolean>
}

export function SetCard({ set, meta, progress, aside, onOpen, onDelete }: Props) {
  const title = describeSet(set)
  const sec = set.filters?.section
  return (
    <li className={sec ? `setcard sec-${sec}` : 'setcard'}>
      <button type="button" className="setcard-main" onClick={onOpen}>
        <i className="setcard-dot" aria-hidden="true" />
        <span className="setcard-text">
          <span className="setcard-t">{title}</span>
          <span className="setcard-b">{meta}</span>
        </span>
        {progress !== undefined ? (
          <span className="setcard-meter" aria-hidden="true">
            {progress > 0 ? <span style={{ width: `${Math.min(progress, 1) * 100}%` }} /> : null}
          </span>
        ) : null}
        {aside}
      </button>
      <ConfirmDelete label={`Delete set: ${title}`} onConfirm={onDelete} />
    </li>
  )
}

/** The Resume affordance inside a row's button: text on desktop, an icon on phones. */
export function ResumeLabel() {
  return (
    <span className="btn sm setcard-go">
      <span className="setcard-go-t">Resume</span>
      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
    </span>
  )
}
