// @vitest-environment jsdom
/**
 * Cross-out and selection semantics on a multiple-choice question (P-22, P-24).
 *
 * A crossed choice must stay in the tab order and, as in Bluebook, clicking it
 * un-crosses and selects it. The picked choice and each cross-out control
 * expose their state, not just a colour or a letter.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuestionView } from './QuestionView'
import type { Annotation, Question } from '../types'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const question: Question = {
  id: 'q1', section: 'MATH', domain: 'H', domain_name: 'Algebra', skill: 'H.A',
  skill_name: 'Linear equations', difficulty: 'E', band: null, type: 'mcq',
  stimulus_html: '', stem_html: '<p>Pick one.</p>', key_recovered: false, source_path: '',
  options: ['A', 'B', 'C', 'D'].map((label) => ({ label, html: `<p>${label} text</p>` })),
}

it('keeps a crossed choice focusable, names the controls, and un-crosses on pick', () => {
  const onToggleCrossOut = vi.fn()
  const onRespond = vi.fn()
  act(() => root.render(
    <QuestionView question={question} number={1} annotations={[]} result={null} seconds={0}
                  response="A" flagged crossOutMode crossOut={new Set(['B'])}
                  onRespond={onRespond} onSubmit={() => {}} onToggleFlag={() => {}}
                  onToggleCrossOutMode={() => {}} onToggleCrossOut={onToggleCrossOut}
                  onAddAnnotation={() => {}} onUpdateAnnotation={() => {}} onRemoveAnnotation={() => {}}
                  mistake={null} onSaveMistake={() => {}} />,
  ))
  const choices = [...host.querySelectorAll<HTMLButtonElement>('button.choice-main')]
  expect(choices.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])

  const crossed = choices[1]!
  expect(crossed.disabled).toBe(false)
  expect(crossed.getAttribute('aria-disabled')).toBe('true')
  expect(crossed.textContent).toContain('(crossed out)')
  expect(choices[0]!.hasAttribute('aria-disabled')).toBe(false)

  const strikes = [...host.querySelectorAll('button.crossbtn')]
  expect(strikes[0]!.getAttribute('aria-label')).toBe('Cross out choice A')
  expect(strikes[0]!.getAttribute('aria-pressed')).toBe('false')
  expect(strikes[1]!.getAttribute('aria-label')).toBe('Undo cross out of choice B')
  expect(strikes[1]!.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('.strike')?.getAttribute('aria-label')).toBe('Cross out answer choices')
  expect(host.querySelector('.markbtn')?.getAttribute('aria-pressed')).toBe('true')

  act(() => crossed.click())
  expect(onToggleCrossOut).toHaveBeenCalledWith('B')
  expect(onRespond).toHaveBeenCalledWith('B')

  act(() => choices[2]!.click())
  expect(onToggleCrossOut).toHaveBeenCalledTimes(1)
  expect(onRespond).toHaveBeenLastCalledWith('C')
})

it('opens a clicked highlight for editing and only removes it from the trash button (P-28, P-30)', () => {
  const onUpdate = vi.fn()
  const onRemove = vi.fn()
  const annotations: Annotation[] = [
    { id: 3, field: 'stem', start_offset: 0, end_offset: 4, color: 'blue', note: 'check units' },
  ]
  act(() => root.render(
    <QuestionView question={question} number={1} annotations={annotations} result={null} seconds={0}
                  response={null} flagged={false} crossOutMode={false} crossOut={new Set()}
                  onRespond={() => {}} onSubmit={() => {}} onToggleFlag={() => {}}
                  onToggleCrossOutMode={() => {}} onToggleCrossOut={() => {}}
                  onAddAnnotation={() => {}} onUpdateAnnotation={onUpdate} onRemoveAnnotation={onRemove}
                  mistake={null} onSaveMistake={() => {}} />,
  ))
  const mark = host.querySelector<HTMLElement>('.stem mark.hl')!
  expect(mark.getAttribute('aria-describedby')).toBeTruthy()
  expect(document.getElementById(mark.getAttribute('aria-describedby')!)?.textContent).toBe('check units')

  act(() => mark.click())
  expect(onRemove).not.toHaveBeenCalled()
  const menu = host.querySelector('.hl-menu')!
  const note = menu.querySelector<HTMLInputElement>('.hl-note-input')!
  expect(note.value).toBe('check units')
  expect(menu.querySelector('[aria-label="Highlight blue"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Highlight yellow')

  // With a note, a swatch only picks; Enter saves in the picked colour.
  act(() => menu.querySelector<HTMLButtonElement>('[aria-label="Highlight pink"]')!.click())
  expect(onUpdate).not.toHaveBeenCalled()
  expect(menu.querySelector('[aria-label="Highlight pink"]')?.getAttribute('aria-pressed')).toBe('true')
  act(() => note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(onUpdate).toHaveBeenCalledWith(3, { color: 'pink', note: 'check units' })
  expect(host.querySelector('.hl-menu')).toBeNull()

  act(() => mark.click())
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Remove highlight"]')!.click())
  expect(onRemove).toHaveBeenCalledWith(3)
})

it('moves the passage divider by keyboard and keeps it for the next question', () => {
  const rw: Question = { ...question, id: 'q2', section: 'RW', stimulus_html: '<p>A passage.</p>' }
  const view = (q: Question) => (
    <QuestionView question={q} number={2} annotations={[]} result={null} seconds={0}
                  response={null} flagged={false} crossOutMode={false} crossOut={new Set()}
                  onRespond={() => {}} onSubmit={() => {}} onToggleFlag={() => {}}
                  onToggleCrossOutMode={() => {}} onToggleCrossOut={() => {}}
                  onAddAnnotation={() => {}} onUpdateAnnotation={() => {}} onRemoveAnnotation={() => {}}
                  mistake={null} onSaveMistake={() => {}} />
  )
  act(() => root.render(view(rw)))
  expect(host.querySelector('h2.q-num')?.textContent).toBe('Question 2')
  expect(host.querySelector('section[aria-label=Passage]')).not.toBeNull()
  const grab = () => host.querySelector<HTMLElement>('[role=separator]')!
  const key = (k: string) => act(() => { grab().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
  const outside = vi.fn()
  window.addEventListener('keydown', outside)
  key('ArrowRight')
  expect(grab().getAttribute('aria-valuenow')).toBe('54')
  // The arrows change the question everywhere else, so this one stops here.
  expect(outside).not.toHaveBeenCalled()
  window.removeEventListener('keydown', outside)
  key('End')
  expect(grab().getAttribute('aria-valuenow')).toBe('72')
  key('ArrowRight')
  expect(grab().getAttribute('aria-valuenow')).toBe('72')

  // A new question is a fresh QuestionView; the split carries over.
  act(() => root.render(<div />))
  act(() => root.render(view({ ...rw, id: 'q3' })))
  expect(grab().getAttribute('aria-valuenow')).toBe('72')
  key('Home')
  expect(grab().getAttribute('aria-valuenow')).toBe('28')
  act(() => { grab().parentElement!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
  expect(grab().getAttribute('aria-valuenow')).toBe('50')
})

it('caps a tall phone passage behind a toggle that opens it inline (P-64)', () => {
  const media = window.matchMedia
  const observer = globalThis.ResizeObserver
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as never
  // jsdom has no layout: the cap reports a passage taller than itself.
  const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900)
  const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(330)
  try {
    const rw: Question = { ...question, section: 'RW', stimulus_html: '<p>A long passage.</p>' }
    act(() => root.render(
      <QuestionView question={rw} number={1} annotations={[]} result={null} seconds={0}
                    response={null} flagged={false} crossOutMode={false} crossOut={new Set()}
                    onRespond={() => {}} onSubmit={() => {}} onToggleFlag={() => {}}
                    onToggleCrossOutMode={() => {}} onToggleCrossOut={() => {}}
                    onAddAnnotation={() => {}} onUpdateAnnotation={() => {}} onRemoveAnnotation={() => {}}
                    mistake={null} onSaveMistake={() => {}} />,
    ))
    const cap = host.querySelector('.passage-cap')!
    const toggle = host.querySelector<HTMLButtonElement>('.passage-toggle')!
    expect(cap.className).toBe('passage-cap is-capped')
    expect(cap.getAttribute('tabindex')).toBe('0')
    expect(toggle.textContent).toBe('Show full passage')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    act(() => toggle.click())
    expect(cap.className).toBe('passage-cap')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Show less')
  } finally {
    sh.mockRestore(); ch.mockRestore()
    window.matchMedia = media
    globalThis.ResizeObserver = observer
  }
})
