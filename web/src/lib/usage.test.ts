// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const meta = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./auth', () => ({ API: 'https://sync.example' }))
vi.mock('./store', () => ({
  getMeta: async (key: string) => meta.get(key),
  setMeta: async (key: string, value: unknown) => { meta.set(key, value) },
}))

/** A fresh copy of the module, evaluated under whatever env the test stubbed. */
async function load() {
  vi.resetModules()
  return import('./usage')
}

const ONE = 'https://sync.example/milestone/1'
const TEN = 'https://sync.example/milestone/10'

let fetchMock: ReturnType<typeof vi.fn>
const posted = () => fetchMock.mock.calls.map(([url]) => url)

beforeEach(() => {
  meta.clear()
  vi.stubEnv('PROD', true)
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.head.replaceChildren()
})

describe('milestones', () => {
  it('sends each step once, ever', async () => {
    const { answered } = await load()
    for (const n of [1, 2, 9, 10, 11, 40]) await answered(n)
    expect(posted()).toEqual([ONE, TEN])
  })

  it('catches up someone who answered before counting began', async () => {
    const { answered } = await load()
    await answered(57)
    expect(posted()).toEqual([ONE, TEN])
  })

  it('tries again on the next answer when the Worker refused', async () => {
    const { answered } = await load()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
    await answered(1)
    await answered(2)
    await answered(3)
    expect(posted()).toEqual([ONE, ONE])
  })

  it('tries again after a network failure, without throwing', async () => {
    const { answered } = await load()
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await answered(1)
    await answered(1)
    expect(posted()).toEqual([ONE, ONE])
  })

  it('does not send a step twice when two answers land together', async () => {
    const { answered } = await load()
    await Promise.all([answered(1), answered(1)])
    expect(posted()).toEqual([ONE])
  })

  it('sends nothing from a dev build', async () => {
    vi.stubEnv('PROD', false)
    const { answered } = await load()
    await answered(10)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('beacon', () => {
  it('loads as a classic script with its token, or it reports nothing', async () => {
    vi.stubEnv('VITE_CF_BEACON', 'tok')
    const { loadBeacon } = await load()
    loadBeacon()
    const script = document.head.querySelector('script')
    expect(script?.getAttribute('src'))
      .toBe('https://static.cloudflareinsights.com/beacon.min.js?token=tok')
    expect(script?.hasAttribute('type')).toBe(false)
  })

  it('is not loaded without a token', async () => {
    const { loadBeacon } = await load()
    loadBeacon()
    expect(document.head.querySelector('script')).toBeNull()
  })
})
