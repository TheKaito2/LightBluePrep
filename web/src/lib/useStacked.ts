import { useEffect, useState } from 'react'

/**
 * Below this the two panes stack instead of sitting side by side.
 *
 * Measured, not guessed: at 390px the split gave a 195px passage column and a
 * 191px question column, which puts answer choices at two or three words a line
 * and made single choices over 900px tall. It has to match the breakpoint in
 * styles/bluebook.css.
 */
const STACK_BELOW = 820

export function useStacked(): boolean {
  const query = `(max-width: ${STACK_BELOW - 1}px)`
  const [stacked, setStacked] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setStacked(mq.matches)
    // No immediate onChange(): useState already read matchMedia, and calling it
    // here just forces a second render on every mount.
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return stacked
}
