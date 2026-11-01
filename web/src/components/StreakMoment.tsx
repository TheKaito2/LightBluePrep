/**
 * The small celebration after the first set of a day: Bulb, the streak and its
 * week. Once a day per device; which day it last showed is only a convenience,
 * so it stays in this browser.
 */
import { useEffect, useState } from 'react'
import { Mascot } from './Mascot'
import { Modal } from './Modal'
import { WeekDots } from './ProgressStrip'
import { fmt } from '../lib/labels'
import { dayKey, streak, type HistoryRow } from '../lib/progress'

const KEY = 'lbp.streakShown'

function shownOn(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

function markShown(day: string) {
  try { localStorage.setItem(KEY, day) } catch { /* it may show again; nothing else depends on it */ }
}

export function StreakMoment({ history }: { history: HistoryRow[] }) {
  const st = streak(history)
  const days = st.current
  const [open, setOpen] = useState(false)
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the attempt log loads after mount, and localStorage is outside React
    if (days && shownOn() !== dayKey(new Date())) setOpen(true)
  }, [days])
  if (!open) return null
  const close = () => { markShown(dayKey(new Date())); setOpen(false) }
  return (
    <Modal title="Nice work today" className="moment" onClose={close}
           footer={<button type="button" className="btn primary" onClick={close}>Continue</button>}>
      <div className="moment-in">
        <Mascot mood="streak" size={96} />
        <p className="moment-n">{fmt(days)}<span>day streak</span></p>
        <WeekDots last7={st.last7} />
      </div>
    </Modal>
  )
}
