import { useEffect, useState, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), select:not([disabled]),'
  + ' input:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

/**
 * Keep Tab and Shift+Tab inside an open modal.
 *
 * The dialogs say aria-modal="true", which tells a screen reader the page
 * behind is out of reach, but Tab still walked straight out of them into the
 * page underneath. Focus on open, Escape and focus return live in
 * components/Modal.tsx; this only wraps the ends.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const box = ref.current
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((el) => el.getClientRects().length > 0)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const inside = box.contains(document.activeElement)
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref, active])
}

/**
 * The whole modal contract for an overlay that is not built on Modal (the
 * practice screen's own Bluebook-styled ones): trap Tab, move focus to
 * `initial` (the close button) on open, and hand it back to whatever opened
 * the overlay when it closes.
 *
 * Call it unconditionally in a component that mounts when the overlay opens.
 * If the opener has gone by then (the navigator's "Go to Review Page" button
 * leaves with the navigator), focus goes to <main> rather than <body>, so the
 * next Tab starts somewhere sensible.
 */
export function useDialogFocus(
  box: RefObject<HTMLElement | null>, initial: RefObject<HTMLElement | null>,
): void {
  // Read during the first render, before this overlay's effects move focus.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  useFocusTrap(box, true)
  useEffect(() => {
    const node = box.current
    if (!node?.contains(document.activeElement)) initial.current?.focus()
    // Only on a real close: StrictMode's rehearsal unmount keeps the node.
    return () => {
      if (node?.isConnected) return
      if (opener?.isConnected) opener.focus()
      else document.querySelector<HTMLElement>('main')?.focus()
    }
  }, [box, initial, opener])
}
