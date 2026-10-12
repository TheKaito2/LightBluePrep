import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), select:not([disabled]),'
  + ' input:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

/**
 * Keep Tab and Shift+Tab inside an open modal.
 *
 * The dialogs say aria-modal="true", which tells a screen reader the page
 * behind is out of reach, but Tab still walked straight out of them into the
 * page underneath. Focus on open, Escape and focus return stay with each
 * dialog; this only wraps the ends.
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
