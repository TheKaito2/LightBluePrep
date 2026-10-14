/**
 * The one place a failed load or save is reported. Announced as it appears,
 * dismissed with a real button, and never on a timer: a student who looked
 * away still needs to know their answer did not save.
 */
import { Icon } from './Icon'

export function ErrorBanner({ message, onRetry, onDismiss }: {
  message: string
  onRetry?: () => void
  onDismiss: () => void
}) {
  return (
    <div className="errbar" role="alert">
      <Icon name="alert" size={16} />
      <p className="errbar-t">{message}</p>
      {onRetry ? <button type="button" className="errbar-retry" onClick={onRetry}>Retry</button> : null}
      <button type="button" className="errbar-x" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
