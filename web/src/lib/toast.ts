/**
 * The toast context, apart from components/Toast.tsx so that file exports only
 * components and keeps fast refresh.
 */
import { createContext, useContext } from 'react'

export interface ToastOptions {
  tone?: 'ok' | 'bad'
  /** Shows an "Undo" action; the toast closes after it runs. */
  onUndo?: () => void
}

export type Show = (text: string, options?: ToastOptions) => void

export const ToastContext = createContext<Show>(() => {})

export const useToast = () => useContext(ToastContext)
