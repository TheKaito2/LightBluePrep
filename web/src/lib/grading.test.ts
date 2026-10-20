/**
 * grading.ts is a port of bluebank/grading.py. The Python behaviour is the
 * spec: if a shared case fails here and passes there, the port is wrong.
 *
 * Cases taken from the bank name the question they came from. Two shared rows
 * ("1200" and ".1667") pin bugs that silently produced *wrong* answer keys,
 * which is worse than a missing one because it teaches you the wrong thing and
 * you never notice.
 */
import { describe, expect, it } from 'vitest'
import { asFraction, canonical, grade, gradeMcq, gradeSpr, regrade, tooFewDigits } from './grading'
import { equals } from './fraction'
import type { GradeResult, StoredQuestion } from '../types'
import cases from '../../../tests/fixtures/grading.json'

/**
 * The shared rows in tests/fixtures/grading.json, which tests/test_backend.py
 * runs against grading.py. Two graders that each pass their own hand-written
 * cases can still disagree; one table both have to pass cannot.
 */
describe('shared grading cases', () => {
  it.each(cases.canonical)('canonical($value): $why', ({ value, canonical: expected }) => {
    expect(canonical(value)).toBe(expected)
  })
  it.each(cases.spr)('gradeSpr($response): $why', ({ response, accepted, correct, match }) => {
    expect(gradeSpr(response, accepted)).toEqual([correct, match])
  })
  it.each(cases.mcq)('gradeMcq($response): $why', ({ response, accepted, correct, match }) => {
    expect(gradeMcq(response, accepted)).toEqual([correct, match])
  })
})

describe('canonical', () => {
  it('treats undefined as blank', () => {
    expect(canonical(undefined)).toBe('')
  })
})

describe('asFraction', () => {
  it('parses equal values written differently', () => {
    const a = asFraction('3/2')
    const b = asFraction('1.5')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(equals(a!, b!)).toBe(true)
  })

  it('rejects non-numbers and division by zero', () => {
    expect(asFraction('three halves')).toBeNull()
    expect(asFraction('1/0')).toBeNull()
    expect(asFraction('1..2')).toBeNull()
    expect(asFraction('--3')).toBeNull()
    expect(asFraction('')).toBeNull()
  })

  it('matches Python Fraction on exponents and currency', () => {
    // Verified against the Python implementation, not assumed.
    expect(equals(asFraction('1e3')!, asFraction('1000')!)).toBe(true)
    expect(equals(asFraction('2.5e-2')!, asFraction('1/40')!)).toBe(true)
    expect(equals(asFraction('$12.50')!, asFraction('25/2')!)).toBe(true)
  })

  it('is exact where floats are not', () => {
    // 3/17 has no finite binary expansion; a float port passes .1765 here.
    expect(equals(asFraction('3/17')!, asFraction('0.1765')!)).toBe(false)
    expect(equals(asFraction('0.1')!, asFraction('1/10')!)).toBe(true)
  })
})

describe('grade', () => {
  it('carries every accepted form, not just the first', () => {
    const question = {
      id: 'x', type: 'spr', correct: ['10/3', '3.75'], rationale_html: '<p>r</p>',
    } as unknown as StoredQuestion
    const result = grade(question, '3.75')
    expect(result.correct).toBe(true)
    expect(result.accepted).toEqual(['10/3', '3.75'])
  })

  it('shows why the picked choice is wrong, and why the key is right', () => {
    const question = {
      id: 'y', type: 'mcq', correct: ['C'],
      explanations: { A: '<p>no</p>', C: '<p>yes</p>' },
      rationale_html: '<p>full</p>',
    } as unknown as StoredQuestion
    const wrong = grade(question, 'A')
    expect(wrong.correct).toBe(false)
    expect(wrong.why_wrong_html).toBe('<p>no</p>')
    expect(wrong.why_right_html).toBe('<p>yes</p>')

    const right = grade(question, 'C')
    expect(right.correct).toBe(true)
    expect(right.why_wrong_html).toBeNull()
  })
})

describe('tooFewDigits', () => {
  const key = ['-.3266', '-.3267', '-49/150'] // 429fb7c0
  it('flags the right value cut short, leading zero or not', () => {
    expect(tooFewDigits('-0.326', key)).toBe(true)
    expect(tooFewDigits('-0.327', key)).toBe(true)
    expect(tooFewDigits('-.33', key)).toBe(true)
  })
  it('stays quiet for a wrong value, a whole number or a full answer', () => {
    expect(tooFewDigits('-0.5', key)).toBe(false)
    expect(tooFewDigits('-1', key)).toBe(false)
    expect(tooFewDigits('-.3266', key)).toBe(false)
    expect(tooFewDigits('.5', ['.5', '1/2'])).toBe(false)
  })
})

describe('regrade', () => {
  const first: GradeResult = {
    question_id: 'q', response: 'A', correct: false, match: null, accepted: ['B'],
    why_wrong_html: '<p>why A</p>', why_right_html: '<p>why B</p>', rationale_html: null,
  }
  it('grades a new pick against the same key, without the old pick\'s reason', () => {
    expect(regrade(first, 'mcq', 'b')).toMatchObject({ response: 'b', correct: true, match: 'listed', why_wrong_html: null })
    expect(regrade(first, 'mcq', 'C')).toMatchObject({ correct: false, why_wrong_html: null })
    expect(regrade(first, 'mcq', 'A').why_wrong_html).toBe('<p>why A</p>')
  })
  it('grades a grid-in by value', () => {
    expect(regrade({ ...first, accepted: ['6/5', '1.2'] }, 'spr', '1.20').correct).toBe(true)
  })
})
