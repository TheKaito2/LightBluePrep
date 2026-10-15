import { describe, expect, it } from 'vitest'
import { wrapLines } from './share'

// One unit per character keeps widths easy to reason about.
const measure = (s: string) => s.length

describe('wrapLines', () => {
  it('keeps a short line whole', () => {
    expect(wrapLines('Linear functions', 20, 2, measure)).toEqual(['Linear functions'])
  })

  it('breaks between words', () => {
    expect(wrapLines('Words in Context and Boundaries', 20, 2, measure))
      .toEqual(['Words in Context and', 'Boundaries'])
  })

  it('ends the last allowed line in an ellipsis when the rest will not fit', () => {
    const lines = wrapLines('Craft and Structure + Information and Ideas + 3 more', 20, 2, measure)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Craft and Structure')
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(lines[1]!.length).toBeLessThanOrEqual(20)
  })

  it('cuts a single word wider than the line', () => {
    expect(wrapLines('Supercalifragilistic', 10, 2, measure)).toEqual(['Supercali…'])
  })
})
