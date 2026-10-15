/**
 * Run `fn` once the browser has nothing better to do. Returns a cancel, so it
 * can be an effect's cleanup.
 *
 * Safari has no requestIdleCallback; there a short timeout stands in.
 */
export function whenIdle(fn: () => void, timeout = 4000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 1500)
  return () => window.clearTimeout(id)
}
