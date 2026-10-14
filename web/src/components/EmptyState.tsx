/**
 * Empty state (spec 7.12): Bulb at 72px, a title, one sentence on how to fill
 * the space, and at most one primary action. Centred, 380px wide.
 */
import type { ComponentProps, ReactNode } from 'react'
import { Mascot } from './Mascot'

interface Props {
  title: ReactNode
  body?: ReactNode
  /** 'oops' for errors, 'cheer' for an all-correct result. */
  mood?: ComponentProps<typeof Mascot>['mood']
  /** One primary button, or nothing. */
  action?: { label: string; onClick: () => void }
  /** Extra content under the sentence, such as the locked-Stats meters. */
  children?: ReactNode
  className?: string
}

export function EmptyState({ title, body, mood = 'neutral', action, children, className }: Props) {
  return (
    <div className={className ? `empty ${className}` : 'empty'}>
      <Mascot mood={mood} size={72} />
      <h3 className="empty-t">{title}</h3>
      {body ? <p className="empty-p">{body}</p> : null}
      {children}
      {action ? <button type="button" className="btn primary" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  )
}
