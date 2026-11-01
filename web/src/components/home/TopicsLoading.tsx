import { useEffect, useState } from 'react'

/** How long the first load may run before saying the connection is slow. */
const SLOW_MS = 8000

/** The topic picker's placeholder while the first load runs: a note and four skeleton cards. */
export function TopicsLoading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className="topics-wait">
      <div className="topics-wait-msg" role="status" aria-live="polite">
        <p>Loading the question list from College Board. First visit only, about 1.5 MB.</p>
        {slow ? <p>Slow connection. This only happens once.</p> : null}
      </div>
      <div className="sktiles" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sktile dskel">
            <span className="skel skel-t" />
            <span className="skel skel-row" />
            <span className="skel skel-row" />
          </div>
        ))}
      </div>
    </div>
  )
}
