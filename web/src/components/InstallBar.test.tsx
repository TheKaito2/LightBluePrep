// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No IndexedDB here (see store.test.ts): meta is an in-memory map.
const meta = new Map<string, unknown>()
vi.mock('../lib/store', () => ({
  INSTALL_KEY: 'install-bar-dismissed',
  getMeta: (k: string) => Promise.resolve(meta.get(k)),
  setMeta: (k: string, v: unknown) => { meta.set(k, v); return Promise.resolve() },
}))
const { InstallBar } = await import('./InstallBar')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0'
const ua = vi.spyOn(navigator, 'userAgent', 'get')

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  meta.clear()
  ua.mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const render = async (answered: number) => { await act(async () => root.render(<InstallBar answered={answered} />)) }
const button = (name: string) => [...host.querySelectorAll('button')]
  .find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name)

/** What Chromium fires when the site is installable. */
function offerPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => { window.dispatchEvent(event) })
  return event
}

describe('InstallBar', () => {
  it('shows nothing where there is nothing to offer', async () => {
    await render(25)
    expect(host.innerHTML).toBe('')
  })

  it('offers the deferred prompt only from the 10th answer, and remembers the answer', async () => {
    const event = offerPrompt()
    expect(event.defaultPrevented).toBe(true)
    await render(9)
    expect(host.innerHTML).toBe('')
    await render(10)
    expect(host.textContent).toContain('it opens like an app')
    await act(async () => { button('Install')!.click() })
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(meta.get('install-bar-dismissed')).toBe(true)
    expect(host.innerHTML).toBe('')
  })

  it('points iOS Safari at Add to Home Screen, not in-app browsers', async () => {
    ua.mockReturnValue(IPHONE)
    await render(12)
    expect(host.textContent).toContain('Add to Home Screen')
    expect(button('Install')).toBeUndefined()
    await act(async () => { button('Dismiss')!.click() })
    expect(host.innerHTML).toBe('')
    expect(meta.get('install-bar-dismissed')).toBe(true)

    meta.clear()
    ua.mockReturnValue(INSTAGRAM)
    await render(13)
    expect(host.innerHTML).toBe('')
  })

  it('stays away once dismissed', async () => {
    meta.set('install-bar-dismissed', true)
    ua.mockReturnValue(IPHONE)
    await render(40)
    expect(host.innerHTML).toBe('')
  })
})
