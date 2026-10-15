/**
 * The daily reminder (G-03): an .ics file the student adds to their own
 * calendar. A calendar alarm is the one reminder that needs no server, no
 * push permission and no account, and nothing about it leaves the device.
 *
 * Written by hand to RFC 5545 rather than with a library: one event, one rule,
 * one alarm. The two easy mistakes are the line rules (CRLF, and lines folded
 * at 75 octets, not characters) and UNTIL, which must be a floating time like
 * DTSTART or strict calendars drop the rule.
 */

export const SITE_URL = 'https://lightblueprep.pages.dev/'
export const REMINDER_FILE = 'lightblueprep-reminder.ics'

export interface Reminder {
  /** "HH:MM", local time. */
  time: string
  /** Questions a day, for the title. */
  daily: number
  /** "YYYY-MM-DD" test date; the reminders stop the day before it. */
  until?: string | null
  now?: Date
  /** Stable in tests; random otherwise, so a second import adds rather than clashes. */
  uid?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A floating local date-time: no Z, so 7 pm stays 7 pm wherever the student is. */
const local = (d: Date, hh = 0, mm = 0) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** TEXT values escape backslash, semicolon, comma and newline (RFC 5545 3.3.11). */
export const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/**
 * Fold a content line to 75 octets, continuing with CRLF and one space. Counted
 * in UTF-8 bytes, and never splitting a character, since a calendar that reads
 * half a multi-byte character shows garbage.
 */
export function fold(line: string): string {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    // Continuation lines start with a space, which counts toward their 75.
    if (size + n > 75) { out.push(cur); cur = ' '; size = 1 }
    cur += ch
    size += n
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildReminder({ time, daily, until, now = new Date(), uid }: Reminder): string {
  const [hh, mm] = time.split(':').map(Number)
  const title = `SAT practice: ${daily} questions`
  // UNTIL is inclusive, so midnight at the start of test day ends the run on
  // the evening before: no "go practice" alarm on the morning of the test.
  let rule = 'RRULE:FREQ=DAILY'
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) {
    // With a time it parses as local midnight; a bare date would be UTC.
    const end = new Date(`${until}T00:00:00`)
    if (end > now) rule += `;UNTIL=${local(end)}`
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LightBluePrep//Daily reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid ?? crypto.randomUUID()}@lightblueprep.pages.dev`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${local(now, hh, mm)}`,
    'DURATION:PT15M',
    rule,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(`Answer ${daily} questions on LightBluePrep to keep your streak going: ${SITE_URL}`)}`,
    `URL:${SITE_URL}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export const reminderBlob = (r: Reminder) =>
  new Blob([buildReminder(r)], { type: 'text/calendar;charset=utf-8' })
