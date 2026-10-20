import { describe, expect, it } from 'vitest'
import { formatHash, idNeedle, parseHash, titleFor, urlFor, type View } from './route'

const ROUTED: View[] = ['plan', 'review', 'stats', 'resources', 'about', 'settings', 'inbox']

describe('parseHash', () => {
  it('reads every routed view, with or without the #', () => {
    for (const view of ROUTED) {
      expect(parseHash(`#${view}`)).toBe(view)
      expect(parseHash(view)).toBe(view)
    }
  })

  it('is Home for no hash and anything it does not know', () => {
    expect(parseHash('')).toBe('home')
    expect(parseHash('#')).toBe('home')
    expect(parseHash('#main')).toBe('home')
    // In-memory views cannot be reopened from a URL.
    expect(parseHash('#practice')).toBe('home')
    expect(parseHash('#results')).toBe('home')
  })
})

describe('formatHash', () => {
  it('round-trips every routed view and Home', () => {
    for (const view of [...ROUTED, 'home' as const]) {
      expect(parseHash(formatHash(view)!)).toBe(view)
    }
    expect(formatHash('home')).toBe('')
  })

  it('leaves the URL alone for practice and results', () => {
    expect(formatHash('practice')).toBeNull()
    expect(formatHash('results')).toBeNull()
  })
})

describe('urlFor', () => {
  it('sets and clears the hash, keeping the rest', () => {
    expect(urlFor('stats', 'https://x.dev/?a=1').href).toBe('https://x.dev/?a=1#stats')
    expect(urlFor('home', 'https://x.dev/#review').href).toBe('https://x.dev/')
  })

  it('keeps the current URL for practice and results', () => {
    expect(urlFor('practice', 'https://x.dev/#review').href).toBe('https://x.dev/#review')
    expect(urlFor('results', 'https://x.dev/').href).toBe('https://x.dev/')
  })

  it('survives a "//" pathname', () => {
    expect(urlFor('about', 'https://x.dev//').href).toBe('https://x.dev//#about')
  })
})

describe('titleFor', () => {
  const HOME = 'LightBluePrep · Free SAT question bank'

  it('gives Home the index.html title and every other view its own', () => {
    expect(titleFor('home', HOME)).toBe(HOME)
    const titles = new Set(ROUTED.map((v) => titleFor(v, HOME)))
    expect(titles.size).toBe(ROUTED.length)
    expect(titleFor('review', HOME)).toBe('Review · LightBluePrep')
    expect(titleFor('results', HOME)).toBe('Results · LightBluePrep')
  })

  it('names the question and set in practice', () => {
    expect(titleFor('practice', HOME, { index: 2, count: 10, set: 'Math: Linear functions' }))
      .toBe('Question 3 of 10 · Math: Linear functions · LightBluePrep')
    expect(titleFor('practice', HOME, { index: 0, count: 3767, set: 'All questions' }))
      .toBe(`Question 1 of ${(3767).toLocaleString()} · All questions · LightBluePrep`)
    expect(titleFor('practice', HOME, { index: 0, count: 0, set: 'Math' }))
      .toBe('Practice · LightBluePrep')
  })
})

describe('idNeedle', () => {
  it('trims and lowercases a typed ID', () => {
    expect(idNeedle('  D72B325E ')).toBe('d72b325e')
  })

  it('pulls q out of a pasted share link', () => {
    expect(idNeedle('https://lightblueprep.pages.dev/?q=D72B325E')).toBe('d72b325e')
    expect(idNeedle('lightblueprep.pages.dev/?skill=WIC&q=d72b325e#top')).toBe('d72b325e')
  })

  it('survives a malformed escape', () => {
    expect(idNeedle('/?q=%E0%A4%A')).toBe('%e0%a4%a')
  })
})
