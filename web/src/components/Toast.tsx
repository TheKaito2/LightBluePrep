/**
 * Toasts (spec 7.13): one at a time, bottom centre, on ink.
 *
 * <ToastProvider> sits at the root; anything below calls useToast() and shows
 * a message. A new toast replaces the old one. Confirmations clear themselves
 * after 4s; errors stay until closed, so a slow reader never loses one.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { ToastContext, type Show, type ToastOptions } from '../lib/toast'

interface Current extends ToastOptions { text: string; key: number }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Current | null>(null)
  const show = useCallback<Show>((text, options = {}) => setToast({ ...options, text, key: Date.now() }), [])

  useEffect(() => {
    if (!toast || toast.tone === 'bad') return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* The live region stays mounted so screen readers hear each new message. */}
      <div role="status" aria-live="polite">
        {toast ? (
          <div key={toast.key} className={toast.tone ? `toast ${toast.tone}` : 'toast'}>
            {toast.tone ? <Icon name={toast.tone === 'ok' ? 'check-circle' : 'alert'} size={16} /> : null}
            <span>{toast.text}</span>
            {toast.onUndo ? (
              <button type="button" className="toast-undo"
                      onClick={() => { toast.onUndo?.(); setToast(null) }}>Undo</button>
            ) : null}
            {toast.tone === 'bad' ? (
              <button type="button" className="toast-x" onClick={() => setToast(null)} aria-label="Dismiss">
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}
