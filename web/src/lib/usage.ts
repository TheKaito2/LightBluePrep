/**
 * Everything that counts how the site is used. Two things, both anonymous, and
 * both described in public/privacy.html and on the About page: keep all three
 * in step.
 *
 * 1. Cloudflare Web Analytics: page views, where visitors came from, country
 *    and device type. It sets no cookie, stores nothing on the device and does
 *    not fingerprint anyone (Cloudflare's own docs say so), which also means it
 *    counts visits and never people.
 *
 * 2. Milestones: how many PEOPLE use it, which page views cannot tell. The first
 *    time this browser answers a question it tells the sync Worker, and again
 *    once it has answered ten different questions. Once each, ever: the browser
 *    remembers what it already sent, so the request carries no id, no cookie
 *    and nothing else that could tell two people apart, and the Worker keeps
 *    only a total per day. One person on two devices counts twice, and clearing
 *    the site's data counts them again.
 *
 * Both run only in a production build. The dev server talks to the real Worker,
 * and testing must not count as a visitor.
 */
import { API } from './auth'
import * as store from './store'

const BEACON = import.meta.env.VITE_CF_BEACON as string | undefined

/** What this build counts, one flag each, so About only claims what runs. */
export const countsVisits = import.meta.env.PROD && Boolean(BEACON)
export const countsPeople = import.meta.env.PROD && Boolean(API)

/** No token, no beacon: the localhost build and forks send nothing. */
export function loadBeacon(): void {
  if (!countsVisits) return
  const script = document.createElement('script')
  // A classic script on purpose, never type="module": the beacon finds its
  // token through document.currentScript, which is null inside a module, and
  // then loads without an error and reports nothing. Token in the query
  // string, Cloudflare's form for a script added at runtime; _headers allows
  // exactly this path.
  script.src = `https://static.cloudflareinsights.com/beacon.min.js?token=${encodeURIComponent(BEACON!)}`
  document.head.append(script)
}

/** Different questions answered. 1 means tried it; 10 means uses it. */
const STEPS = [1, 10]
const SENT_KEY = 'milestones.sent'

let queue: Promise<void> = Promise.resolve()

/**
 * Called after every answer with how many different questions this browser has
 * answered. Queued, so two quick answers cannot both send the same step.
 */
export function answered(questions: number): Promise<void> {
  if (!countsPeople) return queue
  // A failed count must never reach the user. Nothing is marked sent until the
  // Worker has taken it, so the next answer simply tries again.
  queue = queue.then(() => send(questions)).catch(() => {})
  return queue
}

async function send(questions: number): Promise<void> {
  const sent = (await store.getMeta<number[]>(SENT_KEY)) ?? []
  for (const step of STEPS) {
    if (questions < step || sent.includes(step)) continue
    const res = await fetch(`${API}/milestone/${step}`, { method: 'POST' })
    if (!res.ok) return
    sent.push(step)
    await store.setMeta(SENT_KEY, sent)
  }
}
