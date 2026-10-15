// @vitest-environment jsdom
/** The navigator's labels, paging and footer (P-53, P-54). */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Navigator } from './Navigator'
import type { CellState } from '../lib/sets'
import type { SetItem } from '../types'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const make = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `q${i}`, skill_name: 'Skill', difficulty: 'E', flagged: i === 6 ? 1 : 0,
  attempt_count: i === 6 ? 1 : 0, last_correct: i === 6 ? 0 : null,
}) as unknown as SetItem)

const cells = () => [...host.querySelectorAll<HTMLButtonElement>('.nav-cell')]
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!

describe('Navigator', () => {
  it('names each cell with its state and marks the current one', () => {
    act(() => root.render(<Navigator items={make(10)} current={2} title="T" onGo={() => {}} onClose={() => {}} />))
    expect(cells()[6]!.getAttribute('aria-label')).toBe('Question 7, incorrect, marked for review. Skill, Easy')
    expect(cells()[6]!.querySelector('svg')).not.toBeNull()
    expect(cells()[0]!.getAttribute('aria-label')).toBe('Question 1, unanswered. Skill, Easy')
    expect(cells()[2]!.getAttribute('aria-current')).toBe('step')
    expect(host.querySelector('.nav-foot')!.textContent).toContain('10 questions in this list')
  })

  it('says "in this set" only in a set, and never shows a verdict there', () => {
    const states: CellState[] = Array(10).fill('answered')
    act(() => root.render(<Navigator items={make(10)} current={0} title="T" states={states}
                                     onGo={() => {}} onClose={() => {}} />))
    expect(host.querySelector('.nav-foot')!.textContent).toContain('10 questions in this set')
    expect(cells()[6]!.getAttribute('aria-label')).toBe('Question 7, answered, marked for review. Skill, Easy')
    expect(cells()[6]!.querySelector('svg')).toBeNull()
  })

  it('pages a long list by 100 around the current question, with Go to #', () => {
    const onGo = vi.fn()
    act(() => root.render(<Navigator items={make(3767)} current={250} title="T" onGo={onGo} onClose={() => {}} />))
    expect(cells()).toHaveLength(100)
    expect(cells()[0]!.textContent).toBe('201')
    act(() => button('Next 100').click())
    expect(cells()[0]!.textContent).toBe('301')
    expect(host.querySelector('.nav-range')!.textContent).toBe('301–400 of 3,767')

    const input = host.querySelector<HTMLInputElement>('#nav-goto-n')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(input, '3767'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => button('Go').click())
    expect(onGo).toHaveBeenCalledWith(3766)
  })

  it('keeps the last page short and disables Next 100 there', () => {
    act(() => root.render(<Navigator items={make(3767)} current={3766} title="T" onGo={() => {}} onClose={() => {}} />))
    expect(cells()).toHaveLength(67)
    expect(button('Next 100').disabled).toBe(true)
  })
})
