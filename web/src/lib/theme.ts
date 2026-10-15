/**
 * Light, dark, or whatever the device uses (Settings, Appearance).
 *
 * The choice lives in localStorage under lbp.theme. The inline line in the head
 * of index.html and the static pages reads it before the first paint, so there
 * is no flash; this module keeps it current afterwards. Either way the result
 * is data-theme="light" or "dark" on <html>, which every dark rule in the CSS
 * keys off. Practice keeps Bluebook's white whatever the theme, and so does the
 * phone's browser bar while it is open.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'lbp.theme'
/** The browser bar's colour: white, or the dark theme's --surface. */
const BAR = { light: '#ffffff', dark: '#12171d' } as const
const device = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

/** Set when storage refuses the write (private mode), so the pick still holds for this visit. */
let unsaved: ThemeChoice | null = null
let practiceOpen = false

export function themeChoice(): ThemeChoice {
  if (unsaved) return unsaved
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function resolvedTheme(choice: ThemeChoice = themeChoice()): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return device?.matches ? 'dark' : 'light'
}

export function applyTheme(): void {
  const theme = resolvedTheme()
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', practiceOpen ? BAR.light : BAR[theme])
}

export function setThemeChoice(choice: ThemeChoice): void {
  unsaved = null
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    unsaved = choice
  }
  applyTheme()
}

/** Practice is open: keep the browser bar white like the screen under it. */
export function setPracticeOpen(open: boolean): void {
  practiceOpen = open
  applyTheme()
}

// "System" follows the device live, e.g. when it switches to dark at sunset.
device?.addEventListener('change', () => { if (themeChoice() === 'system') applyTheme() })
