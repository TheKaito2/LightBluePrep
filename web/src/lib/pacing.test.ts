/**
 * The set clock, priced from the real test's own pace.
 *
 * Reading and Writing is 32 minutes for 27 questions on the day and Math is 35
 * for 22. Those two numbers are the only inputs, so they are what these tests
 * guard: get them wrong and every timed set is wrong by the same factor without
 * anything looking broken.
 */
import { describe, expect, it } from 'vitest'
import { MODULE, SECONDS_PER_QUESTION, duration, formatClock, isSlow, setSeconds } from './pacing'
import type { Section } from '../types'

const many = (section: Section, n: number): Section[] =>
  Array.from({ length: n }, () => section)

describe('SECONDS_PER_QUESTION', () => {
  it('is the real module divided by its real question count', () => {
    expect(MODULE.RW).toEqual({ minutes: 32, questions: 27 })
    expect(MODULE.MATH).toEqual({ minutes: 35, questions: 22 })
    expect(SECONDS_PER_QUESTION.RW).toBeCloseTo(71.1, 1)
    expect(SECONDS_PER_QUESTION.MATH).toBeCloseTo(95.5, 1)
  })
})

describe('setSeconds', () => {
  it('gives a full module back its own time at 1x', () => {
    // The round trip that matters: 27 RW questions must come out at 32 minutes.
    expect(setSeconds(many('RW', 27), 1)).toBe(32 * 60)
    expect(setSeconds(many('MATH', 22), 1)).toBe(35 * 60)
  })

  it('scales the time, so 0.75x is the hard one', () => {
    const base = setSeconds(many('RW', 27), 1)
    expect(setSeconds(many('RW', 27), 0.75)).toBeLessThan(base)
    expect(setSeconds(many('RW', 27), 1.5)).toBeGreaterThan(base)
    expect(setSeconds(many('RW', 27), 1.5)).toBe(48 * 60)
  })

  it('prices a mixed set per question rather than by a blend', () => {
    // 10 Math and 10 RW is not the same as 20 of either.
    const mixed = setSeconds([...many('RW', 10), ...many('MATH', 10)], 1)
    expect(mixed).toBeGreaterThan(setSeconds(many('RW', 20), 1))
    expect(mixed).toBeLessThan(setSeconds(many('MATH', 20), 1))
  })

  it('lands on a whole minute', () => {
    for (const n of [7, 13, 20, 31]) {
      expect(setSeconds(many('MATH', n), 1) % 60).toBe(0)
    }
  })

  it('has no clock for an empty set or a zero pace', () => {
    expect(setSeconds([], 1)).toBe(0)
    expect(setSeconds(many('RW', 20), 0)).toBe(0)
  })
})

describe('formatClock', () => {
  it('counts down in m:ss and grows an hour when it needs one', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(32 * 60)).toBe('32:00')
    expect(formatClock(3661)).toBe('1:01:01')
  })

  it('never shows a negative clock', () => {
    // The countdown can overshoot zero by a tick between renders.
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('duration', () => {
  it('spells out time spent, to the minute past the hour', () => {
    expect(duration(4)).toBe('4s')
    expect(duration(45)).toBe('45s')
    expect(duration(60)).toBe('1m')
    expect(duration(105)).toBe('1m 45s')
    expect(duration(120)).toBe('2m')
    expect(duration(3599)).toBe('59m 59s')
    expect(duration(3600)).toBe('1h')
    // 87m 58s, which used to wrap on phone.
    expect(duration(5278)).toBe('1h 28m')
    expect(duration(7170)).toBe('2h')
  })

  it('rounds fractions and marks a missing time', () => {
    expect(duration(44.6)).toBe('45s')
    expect(duration(null)).toBe('—')
    expect(duration(undefined)).toBe('—')
  })
})

describe('isSlow', () => {
  it('flags only answers past a quarter over the real pace', () => {
    // 1.25 x 71.1s = 88.9s for Reading and Writing; 1.25 x 95.5s = 119.3s for Math.
    expect(isSlow('RW', 88)).toBe(false)
    expect(isSlow('RW', 89)).toBe(true)
    expect(isSlow('MATH', 119)).toBe(false)
    expect(isSlow('MATH', 120)).toBe(true)
    expect(isSlow('MATH', null)).toBe(false)
  })
})
