/**
 * The one dialog shell: Options, Support, Feedback and anything after them.
 *
 * It owns everything a modal must do so no caller can forget a piece of it
 * (the Options dialog once copied the markup and none of the behaviour):
 * the scrim, aria-modal labelling, focus on open, the Tab trap, Escape, and
 * focus going back to whatever opened it. On a phone it is a bottom sheet.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useFocusTrap } from '../lib/useFocusTrap'

interface Props {
  title: ReactNode
  onClose: () => void
  className?: string
  /** Actions pinned under the scrolling body. Primary goes last. */
  footer?: ReactNode
  children: ReactNode
}

export function Modal({ title, onClose, className, footer, children }: Props) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  // Read during the first render, before any child effect (an autoFocus
  // field, say) has had the chance to move focus into the dialog.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  const [scrolled, setScrolled] = useState(false)
  useFocusTrap(box, true)

  useEffect(() => {
    const node = box.current
    // A child that asked for focus (autoFocus on a field) keeps it.
    if (!node?.contains(document.activeElement)) closeBtn.current?.focus()
    // Only on a real close, when the dialog has left the page. StrictMode's
    // rehearsal unmount keeps the node, and restoring there would pull focus
    // out of the field it just landed in.
    return () => { if (!node?.isConnected) opener?.focus?.() }
  }, [opener])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div ref={box} className={className ? `modal ${className}` : 'modal'}
           role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={scrolled ? 'modal-head scrolled' : 'modal-head'}>
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button ref={closeBtn} type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
          {children}
        </div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </>
  )
}
