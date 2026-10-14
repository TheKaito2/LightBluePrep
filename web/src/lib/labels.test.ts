import { describe, expect, it } from 'vitest'
import { andMore, byDomain, bySkill, describeSet, plural, skillDisplayName } from './labels'
import type { Filters, PracticeSet } from '../types'

const set = (filters: Filters, total = 10): PracticeSet => ({
  id: 's', created_at: 0, finished_at: null, updated_at: 0, seconds: 0,
  filters, total, answered: 0, correct: 0,
})

describe('describeSet', () => {
  it('names a set by its skill first', () => {
    expect(describeSet(set({ skills: ['WIC'] }))).toBe('10 · Words in Context')
    expect(describeSet(set({ skills: ['WIC', 'TRA', 'H.B.'] })))
      .toBe('10 · Words in Context + 2 more')
  })

  it('reads a whole domain as the domain and a whole section as the section', () => {
    expect(describeSet(set({ skills: ['H.A.', 'H.B.', 'H.C.', 'H.D.', 'H.E.'] }))).toBe('10 · Algebra')
    expect(describeSet(set({ skills: ['CID', 'COE', 'INF', 'WIC', 'TSP', 'CTC', 'SYN', 'TRA', 'BOU', 'FSS'] })))
      .toBe('10 · Reading and Writing')
    expect(describeSet(set({ domains: ['EOI'] }))).toBe('10 · Expression of Ideas')
  })

  it('falls back to the section, then All topics', () => {
    expect(describeSet(set({ section: 'MATH' }))).toBe('10 · Math')
    expect(describeSet(set({}))).toBe('10 · All topics')
  })

  it('uses the stored name for a skill code it does not know', () => {
    expect(describeSet(set({ skills: ['NEW'], skill_names: ['Brand New Skill'] }))).toBe('10 · Brand New Skill')
    expect(describeSet(set({ skills: ['NEW'] }))).toBe('10 · NEW')
  })

  it('appends difficulty, status and pace', () => {
    expect(describeSet(set({ section: 'RW', difficulties: ['H'], statuses: ['wrong'], speed: 1.5 }, 1200)))
      .toBe('1,200 · Reading and Writing · Hard · incorrect only · 1.5× time')
    expect(describeSet(set({ statuses: ['unseen'], types: ['WIC.a'] })))
      .toBe('10 · All topics · 1 question type · not answered yet')
  })

  it('lets a set name itself, and can leave the count off', () => {
    expect(describeSet(set({ size: 20, title: 'Score check' }, 20))).toBe('20 · Score check')
    expect(describeSet(set({ section: 'MATH' }), false)).toBe('Math')
  })
})

describe('plural', () => {
  it('formats the count and picks the word', () => {
    expect(plural(1, 'question')).toBe('1 question')
    expect(plural(0, 'question')).toBe('0 questions')
    expect(plural(1200, 'highlight or note', 'highlights and notes')).toBe('1,200 highlights and notes')
  })
})

describe('andMore', () => {
  it('names the first and counts the rest', () => {
    expect(andMore(['A'])).toBe('A')
    expect(andMore(['A', 'B', 'C'])).toBe('A + 2 more')
  })
})

describe('order', () => {
  it('puts domains in College Board order, not alphabetical', () => {
    const rw = ['SEC', 'CAS', 'EOI', 'INI'].map((code) => ({ code, name: code }))
    expect(rw.sort(byDomain).map((d) => d.code)).toEqual(['INI', 'CAS', 'EOI', 'SEC'])
    const math = [{ code: 'P', name: 'Advanced Math' }, { code: 'H', name: 'Algebra' }]
    expect(math.sort(byDomain).map((d) => d.code)).toEqual(['H', 'P'])
  })

  it('puts skills in College Board order, unknown ones last by name', () => {
    const skills = ['CTC', 'zz', 'TSP', 'WIC', 'aa'].map((code) => ({ code, name: code }))
    expect(skills.sort(bySkill).map((s) => s.code)).toEqual(['WIC', 'TSP', 'CTC', 'aa', 'zz'])
  })
})

describe('skillDisplayName', () => {
  it('Title Cases College Board names and keeps unknown ones', () => {
    expect(skillDisplayName('CTC', 'Cross-text Connections')).toBe('Cross-Text Connections')
    expect(skillDisplayName('H.B.', 'Linear functions')).toBe('Linear Functions')
    expect(skillDisplayName('X.Y.', 'Something new ')).toBe('Something new')
  })
})
