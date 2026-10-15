// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let deviceDark = false
const listeners: (() => void)[] = []
vi.stubGlobal('matchMedia', () => ({
  get matches() { return deviceDark },
  addEventListener: (_: string, fn: () => void) => { listeners.push(fn) },
}))

const { applyTheme, setPracticeOpen, setThemeChoice, themeChoice } = await import('./theme')

const theme = () => document.documentElement.getAttribute('data-theme')
const bar = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

beforeEach(() => {
  localStorage.clear()
  deviceDark = false
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />'
  setPracticeOpen(false)
  setThemeChoice('system')
})
afterEach(() => { vi.restoreAllMocks() })

describe('theme', () => {
  it('follows the device until the user picks', () => {
    deviceDark = true
    applyTheme()
    expect(themeChoice()).toBe('system')
    expect(theme()).toBe('dark')
    expect(bar()).toBe('#12171d')
  })

  it('a pick overrides the device, is saved, and goes back to the device on System', () => {
    deviceDark = true
    setThemeChoice('light')
    expect(theme()).toBe('light')
    expect(localStorage.getItem('lbp.theme')).toBe('light')
    setThemeChoice('system')
    expect(localStorage.getItem('lbp.theme')).toBeNull()
    expect(theme()).toBe('dark')
  })

  it('System tracks a device change live, a pick does not', () => {
    applyTheme()
    deviceDark = true
    listeners.forEach((fn) => fn())
    expect(theme()).toBe('dark')
    setThemeChoice('light')
    deviceDark = false
    listeners.forEach((fn) => fn())
    deviceDark = true
    listeners.forEach((fn) => fn())
    expect(theme()).toBe('light')
  })

  it('keeps the pick for the visit when storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private mode') })
    setThemeChoice('dark')
    expect(themeChoice()).toBe('dark')
    expect(theme()).toBe('dark')
  })

  it('keeps the browser bar white while practice is open', () => {
    setThemeChoice('dark')
    setPracticeOpen(true)
    expect(bar()).toBe('#ffffff')
    setPracticeOpen(false)
    expect(bar()).toBe('#12171d')
  })
})
