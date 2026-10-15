/**
 * Two-step delete: a quiet trash button whose first click turns into an inline
 * "Delete?" and "Keep" pair. Keep takes focus, so a stray Enter or a second
 * accidental click lands on the safe choice.
 *
 * onConfirm resolves true once the thing is gone (the caller usually unmounts
 * this) and false when it failed, which puts the trash button back.
 */
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface Props {
  /** Accessible name of the trash button, e.g. "Delete set". */
  label: string
  onConfirm: () => Promise<boolean>
  className?: string
  /** The pair's words where "Delete?" and "Keep" need context, e.g. Results. */
  confirmText?: string
  cancelText?: string
}

type Step = 'idle' | 'ask' | 'busy'

export function ConfirmDelete({
  label, onConfirm, className, confirmText = 'Delete?', cancelText = 'Keep',
}: Props) {
  const [step, setStep] = useState<Step>('idle')
  const keep = useRef<HTMLButtonElement>(null)
  const trash = useRef<HTMLButtonElement>(null)
  // Only hand focus back to the trash button after a choice, not on first mount.
  const returnFocus = useRef(false)

  useEffect(() => {
    if (step === 'ask') keep.current?.focus()
    if (step === 'idle' && returnFocus.current) { returnFocus.current = false; trash.current?.focus() }
  }, [step])

  function back() { returnFocus.current = true; setStep('idle') }

  async function confirm() {
    setStep('busy')
    let ok = false
    try { ok = await onConfirm() } finally {
      // On success the row is usually gone already, and this is a no-op.
      if (ok) setStep('idle'); else back()
    }
  }

  const cls = className ? `cdel ${className}` : 'cdel'
  if (step === 'idle') {
    return (
      <span className={cls}>
        <button ref={trash} type="button" className="btn quiet icon cdel-trash"
                aria-label={label} title={label} onClick={() => setStep('ask')}>
          <Icon name="trash" size={16} />
        </button>
      </span>
    )
  }
  return (
    <span className={cls} role="group" aria-label={label}
          onKeyDown={(e) => { if (e.key === 'Escape' && step === 'ask') { e.stopPropagation(); back() } }}>
      <button type="button" className="btn sm danger-secondary" disabled={step === 'busy'} onClick={confirm}>
        {step === 'busy' ? 'Deleting…' : confirmText}
      </button>
      <button ref={keep} type="button" className="btn sm quiet" disabled={step === 'busy'} onClick={back}>
        {cancelText}
      </button>
    </span>
  )
}
