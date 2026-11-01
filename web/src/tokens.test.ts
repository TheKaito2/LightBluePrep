// @ts-expect-error the app's tsconfig has no Node types; tests run on Node. Vitest empties a `?raw` CSS import.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css: string = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** The hex a token holds in the first (light) block, which fills share with dark. */
function hex(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))
  if (!m) throw new Error(`no hex token --${name}`)
  return m[1]!
}

const channels = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

function luminance(c: string): number {
  const [r, g, b] = channels(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** `top` at `alpha` over `under`, as the browser composites it. */
function over(top: string, alpha: number, under: string): string {
  const t = channels(top), u = channels(under)
  return `#${t.map((v, i) => Math.round(v * alpha + u[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`
}

const WHITE = '#ffffff'

describe('fills that carry text', () => {
  it.each(['fill-brand', 'fill-bad', 'rw-600', 'math-600', 'rw-fill', 'math-fill', 'band-blue', 'band-mint', 'band-violet'])(
    'white on --%s clears 4.5:1', (name) => {
      expect(contrast(WHITE, hex(name))).toBeGreaterThanOrEqual(4.5)
    })

  // The softest band text (--band-fg-3). Blue and mint fail this, so they use full white.
  it.each(['band-violet', 'rw-fill', 'math-fill'])('78%% white on --%s clears 4.5:1', (name) => {
    expect(contrast(over(WHITE, 0.78, hex(name)), hex(name))).toBeGreaterThanOrEqual(4.5)
  })

  it('ink on the amber band clears 4.5:1', () => {
    for (const ink of ['#11151a', '#2a2410', '#3a3115']) {
      expect(contrast(ink, hex('band-amber'))).toBeGreaterThanOrEqual(4.5)
    }
  })
})
