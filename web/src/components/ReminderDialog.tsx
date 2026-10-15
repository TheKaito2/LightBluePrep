/**
 * "Remind me daily" (G-03): pick a time, get an .ics file with a repeating
 * event and an alarm. The calendar app does the reminding, so nothing is sent
 * anywhere and there is no notification permission to ask for.
 */
import { useId, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { DAILY_DEFAULT, daysUntil, shortDate, type Goal } from '../lib/goal'
import { REMINDER_FILE, reminderBlob } from '../lib/ics'
import { saveBlob } from '../lib/share'
import { useToast } from '../lib/toast'

export function ReminderDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const ids = useId()
  const toast = useToast()
  const [time, setTime] = useState('19:00')
  const daily = goal?.daily ?? DAILY_DEFAULT
  const until = goal?.date && daysUntil(goal.date) > 0 ? goal.date : null

  function download() {
    // A cleared time field reads as "", which would make a 00:00 alarm.
    saveBlob(reminderBlob({ time: /^\d{2}:\d{2}/.test(time) ? time : '19:00', daily, until }), REMINDER_FILE)
    toast(`Saved ${REMINDER_FILE}. Open it to add the reminder to your calendar.`)
    onClose()
  }

  return (
    <Modal title="Daily reminder" onClose={onClose}
           footer={(
             <button type="button" className="btn primary" onClick={download}>
               <Icon name="download" size={16} strokeWidth={2} />
               Download reminder
             </button>
           )}>
      <div className="fb-form">
        <p className="fb-p">
          Adds a daily event with an alert to your calendar app (Apple Calendar,
          Google Calendar, or Outlook): &ldquo;SAT practice: {daily} questions&rdquo;.
        </p>
        <div className="fb-field">
          <label className="fb-label" htmlFor={`${ids}time`}>Time</label>
          <input id={`${ids}time`} type="time" className="goal-input" value={time}
                 aria-describedby={`${ids}note`} onChange={(e) => setTime(e.target.value)} />
          <p id={`${ids}note`} className="fb-note">
            {until
              ? `It repeats every day until your test on ${shortDate(until)}.`
              : 'It repeats every day. Delete the event in your calendar to stop it.'}
            {' '}The file is made in your browser; nothing is sent anywhere.
          </p>
        </div>
      </div>
    </Modal>
  )
}
