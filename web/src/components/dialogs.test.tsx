// @vitest-environment jsdom
/**
 * Focus and dismissal rules for the shared dialog, confirm and toast pieces.
 *
 * These are the behaviours the Options dialog once shipped without (H-01):
 * focus moves in on open, Escape closes, focus goes back to the opener. Tab
 * wrapping is not covered: jsdom has no layout, so useFocusTrap's visibility
 * filter sees nothing. That is checked in a real browser instead.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'
import { ConfirmDelete } from './ConfirmDelete'
import { ToastProvider } from './Toast'
import { useToast } from '../lib/toast'
import { Directions } from './Directions'

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
  vi.useRealTimers()
})

const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === text)!
const press = (key: string) =>
  act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })

function OptionsLike() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Options</button>
      {open ? <Modal title="Practice options" onClose={() => setOpen(false)}><p>body</p></Modal> : null}
    </>
  )
}

describe('Modal', () => {
  it('takes focus, closes on Escape and hands focus back to the opener', () => {
    act(() => root.render(<OptionsLike />))
    const opener = button('Options')
    opener.focus()
    act(() => opener.click())
    const dialog = host.querySelector('[role=dialog]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Practice options')
    expect(document.activeElement).toBe(button('Close'))
    press('Escape')
    expect(host.querySelector('[role=dialog]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('leaves focus on a field that asked for it', () => {
    act(() => root.render(<Modal title="Send feedback" onClose={() => {}}><textarea autoFocus /></Modal>))
    expect(document.activeElement?.tagName).toBe('TEXTAREA')
  })
})

describe('practice overlays (useDialogFocus)', () => {
  function DirectionsLike() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Directions</button>
        {open ? <Directions lines={['Read it.']} keys="Keyboard" onClose={() => setOpen(false)} /> : null}
      </>
    )
  }

  it('is modal, focuses its close button and hands focus back on close', () => {
    act(() => root.render(<DirectionsLike />))
    const opener = button('Directions')
    opener.focus()
    act(() => opener.click())
    expect(host.querySelector('[role=dialog]')?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(button('Close'))
    act(() => button('Close').click())
    expect(host.querySelector('[role=dialog]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

describe('ConfirmDelete', () => {
  it('asks first, focuses Keep, and returns to the trash button on Keep or failure', async () => {
    const onConfirm = vi.fn(async () => false)
    act(() => root.render(<ConfirmDelete label="Delete set" onConfirm={onConfirm} />))
    act(() => button('Delete set').click())
    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button('Keep'))

    act(() => button('Keep').click())
    expect(document.activeElement).toBe(button('Delete set'))

    act(() => button('Delete set').click())
    await act(async () => button('Delete?').click())
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(button('Delete set'))
  })

  it('Escape backs out of the question', () => {
    act(() => root.render(<ConfirmDelete label="Delete set" onConfirm={async () => true} />))
    act(() => button('Delete set').click())
    press('Escape')
    expect(document.activeElement).toBe(button('Delete set'))
  })
})

describe('Toast', () => {
  let show: ReturnType<typeof useToast>
  function Grab() { show = useToast(); return null }

  it('clears a confirmation after 4s but keeps an error until dismissed', () => {
    vi.useFakeTimers()
    act(() => root.render(<ToastProvider><Grab /></ToastProvider>))
    const region = host.querySelector('[role=status]')!
    act(() => show('Set saved', { tone: 'ok' }))
    expect(region.textContent).toBe('Set saved')
    act(() => { vi.advanceTimersByTime(4000) })
    expect(region.textContent).toBe('')

    act(() => show('Could not delete', { tone: 'bad' }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(region.textContent).toBe('Could not delete')
    act(() => button('Dismiss').click())
    expect(region.textContent).toBe('')
  })

  it('shows one at a time and runs Undo', () => {
    const undo = vi.fn()
    act(() => root.render(<ToastProvider><Grab /></ToastProvider>))
    act(() => show('First'))
    act(() => show('Set deleted', { onUndo: undo }))
    expect(host.querySelectorAll('.toast')).toHaveLength(1)
    act(() => button('Undo').click())
    expect(undo).toHaveBeenCalledOnce()
    expect(host.querySelector('.toast')).toBeNull()
  })
})
