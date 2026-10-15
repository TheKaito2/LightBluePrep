// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Segmented } from './Segmented'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

function Harness() {
  const [v, setV] = useState(10)
  return <Segmented legend="Session length" value={v} onChange={setV} hint="Graded at the end"
                    options={[0, 10, 20].map((n) => ({ value: n, label: n ? String(n) : 'No limit' }))} />
}

const radios = () => [...host.querySelectorAll<HTMLButtonElement>('[role=radio]')]
const state = () => radios().map((r) => `${r.textContent}${r.getAttribute('aria-checked') === 'true' ? '*' : ''}${r.tabIndex === 0 ? '^' : ''}`)
const press = (key: string) => act(() => {
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
})

describe('Segmented', () => {
  it('is one named radio group with a single Tab stop', () => {
    act(() => root.render(<Harness />))
    const group = host.querySelector('[role=radiogroup]')!
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toBe('Session length')
    expect(document.getElementById(group.getAttribute('aria-describedby')!)?.textContent).toBe('Graded at the end')
    expect(state()).toEqual(['No limit', '10*^', '20'])
  })

  it('arrows move, pick and wrap; Home and End jump', () => {
    act(() => root.render(<Harness />))
    radios()[1]!.focus()
    press('ArrowRight')
    expect(state()).toEqual(['No limit', '10', '20*^'])
    expect(document.activeElement?.textContent).toBe('20')
    press('ArrowRight')
    expect(state()).toEqual(['No limit*^', '10', '20'])
    press('End')
    expect(state()).toEqual(['No limit', '10', '20*^'])
    press('ArrowLeft')
    expect(state()).toEqual(['No limit', '10*^', '20'])
  })
})
