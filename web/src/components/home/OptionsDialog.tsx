import { useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { Segmented } from '../Segmented'
import { SIZES } from '../../lib/prefs'
import type { Order } from '../../lib/order'
import type { Filters, Status } from '../../types'

/**
 * Which questions inside the chosen topics. One choice, mapped onto `statuses`
 * (joined with "+"). "Not answered or incorrect" is what Stats' Practice
 * buttons pick, so Home can show that choice when you come back.
 */
const WHICH: { key: string; label: string }[] = [
  { key: 'all', label: 'All questions' },
  { key: 'unseen', label: 'Not answered yet' },
  { key: 'wrong', label: 'Incorrect' },
  { key: 'unseen+wrong', label: 'Not answered or incorrect' },
  { key: 'flagged', label: 'Marked for review' },
  { key: 'correct', label: 'Correct' },
]

/** 0 is "no limit": practice the whole pool, open-ended. */
const LENGTHS = SIZES.map((n) => ({ value: n, label: n ? String(n) : 'No limit' }))

/** Test pace first, then easier, with the harder drill last. 0 is untimed. */
const TIMERS = [
  { value: 0, label: 'Untimed' },
  { value: 1, label: '1× (test pace)' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 0.75, label: '0.75× speed drill' },
]

/** Random is a reshuffle of Shuffled, not a third order: it shows as Shuffled. */
const ORDERS = [
  { value: 'shuffled', label: 'Shuffled' },
  { value: 'topic', label: 'By topic' },
] as const

/** Practice options: difficulty, which questions, length, order, timer and the practice-test skip. */
export function OptionsDialog({
  value, onChange, which, order, onOrder, hasLive, difficulty, count, loading, startLabel, onStart, onClose,
}: {
  value: Filters
  onChange: (patch: Partial<Filters>) => void
  /** The current `statuses`, as a WHICH key. */
  which: string
  order: Order
  onOrder: (next: Order) => void
  /** The bank has practice-test questions, so the skip is worth offering. */
  hasLive: boolean
  difficulty: ReactNode
  count: number
  loading: boolean
  startLabel: string
  onStart: () => void
  onClose: () => void
}) {
  /** Reshuffle was pressed: say so, since the list it changed is behind the dialog. */
  const [reshuffled, setReshuffled] = useState(false)
  return (
    <Modal title="Practice options" onClose={onClose} className="opt-dialog" footer={<>
      <button type="button" className="btn quiet lg" onClick={onClose}>Done</button>
      <button type="button" className="btn primary lg" disabled={!count || loading}
              onClick={() => { onClose(); onStart() }}>
        {loading ? 'Counting…' : startLabel}
        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
      </button>
    </>}>
      <div className="opt-body">
        <fieldset className="field">
          <legend className="side-t">Difficulty</legend>
          {difficulty}
          <p className="field-hint">None selected means all</p>
        </fieldset>
        <div className="field">
          <label className="side-t" htmlFor="opt-show">Show</label>
          <select id="opt-show" className="sel" value={which}
                  onChange={(e) => onChange({ statuses: e.target.value === 'all' ? undefined : e.target.value.split('+') as Status[] })}>
            {WHICH.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </div>
        <Segmented legend="Session length" options={LENGTHS} value={value.size ?? 0}
                   onChange={(n) => onChange({ size: n || undefined })}
                   hint="Sets are graded at the end, like Bluebook." />
        <Segmented legend="Order" options={ORDERS} value={order === 'topic' ? 'topic' : 'shuffled'}
                   onChange={(o) => onOrder(o === 'topic' ? 'topic' : 'mixed')}
                   hint={<span aria-live="polite">{reshuffled ? 'New order, kept the same every visit' : 'Same order every visit'}</span>}
                   aside={
                     <button type="button" className="link opt-reshuffle"
                             onClick={() => { onOrder('random'); setReshuffled(true) }}>
                       <Icon name="refresh" size={14} strokeWidth={2.2} />Reshuffle
                     </button>
                   } />
        {/* Always drawn, so picking a length does not make the dialog jump (H-39). */}
        <Segmented legend="Timer" options={TIMERS} value={value.size ? value.speed ?? 0 : 0}
                   onChange={(x) => onChange({ speed: x || undefined })} disabled={!value.size}
                   hint={value.size ? undefined : 'Pick a session length to time it'} />
        {hasLive ? (
          <div className="field">
            <label className="excl">
              <input type="checkbox" checked={value.excludeLive ?? false} aria-describedby="opt-live-h"
                     onChange={(e) => onChange({ excludeLive: e.target.checked || undefined })} />
              Skip questions that appear on official practice tests
            </label>
            <p className="field-hint excl-hint" id="opt-live-h">Keeps the official practice tests fresh for later.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
