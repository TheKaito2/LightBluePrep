import { describe, expect, it } from 'vitest'
import { buildReminder, escapeText, fold } from './ics'

const now = new Date(2026, 9, 15, 10, 30) // Oct 15 2026, local
const lines = (s: string) => s.split('\r\n')

describe('daily reminder .ics', () => {
  it('repeats daily at the chosen local time with an alarm', () => {
    const ics = buildReminder({ time: '19:00', daily: 10, now, uid: 'x' })
    const l = lines(ics)
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // Floating time: no trailing Z, so it fires at 7 pm wherever the device is.
    expect(l).toContain('DTSTART:20261015T190000')
    expect(l).toContain('RRULE:FREQ=DAILY')
    expect(l).toContain('SUMMARY:SAT practice: 10 questions')
    expect(l).toContain('URL:https://lightblueprep.pages.dev/')
    expect(l.indexOf('BEGIN:VALARM')).toBeGreaterThan(l.indexOf('BEGIN:VEVENT'))
    expect(l).toContain('TRIGGER:PT0M')
    // Every line ends CRLF; no bare LF anywhere.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('stops at the start of test day when a date is set', () => {
    const ics = buildReminder({ time: '07:30', daily: 15, until: '2026-12-05', now, uid: 'x' })
    expect(lines(ics)).toContain('RRULE:FREQ=DAILY;UNTIL=20261205T000000')
    expect(lines(ics)).toContain('DTSTART:20261015T073000')
    expect(lines(ics)).toContain('SUMMARY:SAT practice: 15 questions')
  })

  it('leaves out an UNTIL that is already past or malformed', () => {
    for (const until of ['2026-10-01', '2026-10-15', 'Dec 5', '']) {
      expect(lines(buildReminder({ time: '19:00', daily: 10, until, now, uid: 'x' })))
        .toContain('RRULE:FREQ=DAILY')
    }
  })

  it('folds long lines at 75 octets without splitting a character', () => {
    const long = `DESCRIPTION:${'é'.repeat(60)}`
    const folded = fold(long)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    // Unfolding gives the original back.
    expect(folded.replace(/\r\n /g, '')).toBe(long)
    expect(fold('SHORT:line')).toBe('SHORT:line')
  })

  it('folds the generated description, which runs past 75 octets', () => {
    const ics = buildReminder({ time: '19:00', daily: 10, now, uid: 'x' })
    for (const l of lines(ics)) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(ics).toMatch(/\r\n /)
  })

  it('escapes TEXT specials', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })
})
