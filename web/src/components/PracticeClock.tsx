/**
 * The practice clock in the middle of the top bar: a timed set's countdown or
 * the per-question stopwatch, which the student can hide, and the warnings
 * as a set runs low.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatClock } from '../lib/pacing'

/** '0' when the student hid the practice clock; anything else shows it. */
const SHOW_TIMER_KEY = 'lbp.showTimer'

/** A hidden clock: a glyph rather than "···", which looked like loading. */
function TimerHidden() {
  return (
    <>
      <Icon name="clock" size={22} strokeWidth={2} />
      <span className="sr-only">Timer hidden</span>
    </>
  )
}

export function PracticeClock({ remaining, seconds }: {
  /** Seconds left on a timed set; null for the stopwatch. */
  remaining: number | null
  /** Seconds on the question on screen, this visit. */
  seconds: number
}) {
  /** Remembered across visits: someone who hides the clock wants it hidden next time too. */
  const [showTimer, setShowTimer] = useState(() => {
    try { return localStorage.getItem(SHOW_TIMER_KEY) !== '0' } catch { return true }
  })
  const toggleTimer = useCallback(() => setShowTimer((shown) => {
    try { localStorage.setItem(SHOW_TIMER_KEY, shown ? '0' : '1') } catch { /* blocked: lasts for this tab */ }
    return !shown
  }), [])
  /**
   * The five-minute and one-minute warnings. Bluebook shows a hidden clock at
   * five minutes, since a set that ends without warning reads as a crash.
   * `warning` is the visible pill, `spoken` the screen reader announcement.
   */
  const [warning, setWarning] = useState(false)
  const [spoken, setSpoken] = useState('')

  // Crossing a threshold, not landing on it: a backgrounded tab can skip
  // straight past 300. A set resumed with less than that left says nothing,
  // since nothing was crossed.
  const lastRemaining = useRef<number | null>(null)
  useEffect(() => {
    const before = lastRemaining.current
    lastRemaining.current = remaining
    if (before === null || remaining === null) return
    if (before > 300 && remaining <= 300 && remaining > 60) {
      setShowTimer(true); setWarning(true); setSpoken('5 minutes remaining')
    } else if (before > 60 && remaining <= 60 && remaining > 0) {
      setSpoken('1 minute remaining')
    }
  }, [remaining])
  useEffect(() => {
    if (!warning) return
    const t = setTimeout(() => setWarning(false), 5000)
    return () => clearTimeout(t)
  }, [warning])

  return (
    <div className="topbar-center">
      {/* A timed set counts the whole set down, the way a module does on the
          day. Untimed practice keeps the per-question stopwatch it had,
          smaller and grey with a caption, so it does not read as a deadline. */}
      {remaining !== null ? (
        <div role="timer" aria-label="Time remaining"
             className={'clock' + (showTimer ? '' : ' is-hidden') + (remaining <= 60 ? ' is-low' : '')}>
          {!showTimer ? <TimerHidden /> : (
            <>
              {remaining <= 60 ? <Icon name="clock" size={22} strokeWidth={2.4} /> : null}
              {formatClock(remaining)}
            </>
          )}
        </div>
      ) : (
        <div role="timer" aria-label="Time on this question"
             className={'clock is-stopwatch' + (showTimer ? '' : ' is-hidden')}>
          {!showTimer ? <TimerHidden /> : (
            <>
              <span className="clock-time">{formatClock(seconds)}</span>
              <span className="clock-cap" aria-hidden="true">this question</span>
            </>
          )}
        </div>
      )}
      {/* The words swap, so the name does too; aria-pressed on top would
          say the opposite of the label half the time. */}
      <button className="hide-btn" onClick={toggleTimer}
              aria-label={showTimer ? 'Hide timer' : 'Show timer'}>
        {showTimer ? 'Hide' : 'Show'}
      </button>
      {warning ? (
        <div className="clock-warn" aria-hidden="true">
          <Icon name="clock" size={15} strokeWidth={2.2} />
          5 minutes left
        </div>
      ) : null}
      <div className="sr-only" role="status">{spoken}</div>
    </div>
  )
}
