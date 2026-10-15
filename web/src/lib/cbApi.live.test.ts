/**
 * The College Board watchdog, against the real API.
 *
 * Every question on the site comes from these endpoints, fetched by the
 * visitor's browser, so a change on College Board's side breaks the site with
 * no error on ours. .github/workflows/watchdog.yml runs this daily with
 * CB_LIVE=1, and a failed run is what makes GitHub email the repo owner. In
 * the normal suite it is skipped: it needs the network.
 *
 * It goes through the app's own client and normaliser, so it fails on a change
 * that would break the site, not just on an outage. Node ignores CORS, so the
 * browser's view of it is checked header by header on every endpoint.
 */
import { describe, expect, it } from 'vitest'
import {
  DETAIL_URL, IBN_URL, LIST_URL, LOOKUP_URL, fetchDetail, fetchIndex, fetchLiveItems,
} from './cbApi'
import { normaliseQuestion } from './normalize'

const SITE = 'https://lightblueprep.pages.dev'
const OPEN = ['*', SITE]

/** What a browser on the site needs back before it may read the response. */
async function allowOrigin(url: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(url, init)
  expect(res.ok, `${url} answered ${res.status}`).toBe(true)
  return res.headers.get('access-control-allow-origin')
}

describe.runIf(Boolean(import.meta.env.CB_LIVE))('College Board question bank (live)', () => {
  it('still lets a browser on another site call every endpoint (CORS)', async () => {
    // The POSTs go as text/plain, a "simple" request with no preflight, so the
    // header the browser needs is on the POST's own response.
    const posts: [string, unknown][] = [
      [LIST_URL, { asmtEventId: 99, test: 2, domain: 'H' }],
      [DETAIL_URL, { external_id: (await fetchIndex()).find((s) => s._path === 'external_id')!._id }],
    ]
    for (const [url, payload] of posts) {
      expect(OPEN).toContain(await allowOrigin(url, {
        method: 'POST',
        headers: { Origin: SITE, 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      }))
    }
    expect(OPEN).toContain(await allowOrigin(LOOKUP_URL, { headers: { Origin: SITE } }))
  }, 60_000)

  it('serves the index, a question from each host, and the practice-test list', async () => {
    const stubs = await fetchIndex()
    expect(stubs.length).toBeGreaterThan(3000)
    for (const path of ['external_id', 'ibn'] as const) {
      const stub = stubs.find((s) => s._path === path)
      expect(stub, `no ${path} question in the index`).toBeDefined()
      const q = normaliseQuestion(stub!, await fetchDetail(stub!))
      expect(q.stem_html || q.stimulus_html, `${path} question has no text`).toBeTruthy()
      expect(q.correct.length, `${path} question has no answer key`).toBeGreaterThan(0)
      // The disclosed host is a different server with its own CORS settings.
      if (path === 'ibn') {
        expect(OPEN).toContain(await allowOrigin(IBN_URL(stub!._id), { headers: { Origin: SITE } }))
      }
    }
    const live = await fetchLiveItems()
    expect(live.RW.length + live.MATH.length).toBeGreaterThan(0)
  }, 180_000)
})
