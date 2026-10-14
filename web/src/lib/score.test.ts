import { describe, expect, it } from 'vitest'
import { grade, graded } from './score'

describe('grade', () => {
  it('is good from 75, mid from 50, poor below', () => {
    expect(grade(100)).toBe('good')
    expect(grade(75)).toBe('good')
    expect(grade(74)).toBe('mid')
    expect(grade(50)).toBe('mid')
    expect(grade(49)).toBe('poor')
    expect(grade(0)).toBe('poor')
  })
})

describe('graded', () => {
  it('withholds a verdict below five answers', () => {
    expect(graded(0, 0)).toBeNull()
    expect(graded(1, 1)).toBeNull()
    expect(graded(4, 0)).toBeNull()
  })

  it('grades the rounded percentage from five answers up', () => {
    expect(graded(5, 5)).toEqual({ pct: 100, grade: 'good' })
    expect(graded(8, 6)).toEqual({ pct: 75, grade: 'good' })
    expect(graded(6, 3)).toEqual({ pct: 50, grade: 'mid' })
    expect(graded(10, 2)).toEqual({ pct: 20, grade: 'poor' })
  })

  it('takes another minimum', () => {
    expect(graded(1, 1, 1)).toEqual({ pct: 100, grade: 'good' })
  })
})
