/**
 * Browser client for the three College Board question-bank endpoints.
 *
 * No authentication of any kind is required, and all three send
 * `Access-Control-Allow-Origin: *`, which is the only reason a static site can
 * work at all. Verified first-hand from a real browser origin, not inferred
 * from curl headers.
 *
 * That header is theirs to change. If they ever tighten it this whole backend
 * stops working in a browser while the Python one keeps going, because a
 * server ignores CORS. That is the main reason both backends are kept.
 */
import { dedupeStubs, tagStub, type Stub } from './normalize'
import type { Section } from '../types'

export const LIST_URL = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod'
  + '/questionbank/digital/get-questions'
export const DETAIL_URL = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod'
  + '/questionbank/digital/get-question'
export const IBN_URL = (ibn: string) => `https://saic.collegeboard.org/disclosed/${ibn}.json`
export const LOOKUP_URL = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod'
  + '/questionbank/lookup'

const SAT_EVENT_ID = 99
const RW = 1
const MATH = 2
const DOMAINS: Record<number, string> = { [RW]: 'INI,CAS,EOI,SEC', [MATH]: 'H,P,Q,S' }

const RETRIES = 4
const TIMEOUT_MS = 60_000

/**
 * The index is the first thing a new visitor waits on, with nothing on screen
 * until it lands. It measures 1.7s on a normal line, so 20s means the network
 * is not getting through; three tries then fail in about a minute instead of
 * four, and Home can offer another network or a retry.
 */
const INDEX_TRIES = { attempts: 3, timeoutMs: 20_000 }

interface Tries { attempts: number; timeoutMs: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

async function request(
  url: string, init: RequestInit,
  { attempts, timeoutMs }: Tries = { attempts: RETRIES, timeoutMs: TIMEOUT_MS },
): Promise<Json> {
  let last: unknown = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.json()
    } catch (error) {
      last = error
      // Exponential backoff, same shape as the Python client.
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000))
      }
    }
  }
  throw new Error(`${url} failed after ${attempts} attempts: ${last}`)
}

function post(url: string, payload: unknown, tries?: Tries): Promise<Json> {
  return request(url, {
    method: 'POST',
    // text/plain, not application/json, keeps this a CORS "simple" request, so
    // the browser sends it straight away instead of asking with an OPTIONS
    // first. College Board sends no Access-Control-Max-Age, so that preflight
    // was repeated on nearly every question (about 300ms each on 3G). Their API
    // parses the body either way: same 200, byte-identical response.
    // cbApi.live.test.ts checks that still holds.
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  }, tries)
}

/**
 * The whole index in two requests. Measured at 1.66s for all 3,770 entries,
 * which is what makes the on-demand model viable: metadata now, bodies later.
 */
export async function fetchIndex(): Promise<Stub[]> {
  const sections: [number, Section][] = [[RW, 'RW'], [MATH, 'MATH']]
  const pages = await Promise.all(sections.map(async ([test, section]) => {
    const rows: Json[] = await post(LIST_URL, {
      asmtEventId: SAT_EVENT_ID, test, domain: DOMAINS[test],
    }, INDEX_TRIES)
    return rows.map((row) => tagStub(row, section))
  }))
  return dedupeStubs(pages.flat())
}

/** The external_ids that also appear on an official full-length practice test. */
export interface LiveItems { RW: string[]; MATH: string[] }

/**
 * Fetch the practice-test question ids. One GET, no body, no auth, and the same
 * `Access-Control-Allow-Origin: *` as the other three endpoints.
 *
 * This is the list behind "Exclude Active Questions" in College Board's own
 * bank. Their UI matches it against external_id and against the matching
 * section only, so an ibn item is never on a practice test; both of those are
 * reproduced where the filter is applied.
 */
export async function fetchLiveItems(): Promise<LiveItems> {
  const data = await request(LOOKUP_URL, { method: 'GET' })
  return {
    RW: Array.isArray(data?.readingLiveItems) ? data.readingLiveItems : [],
    MATH: Array.isArray(data?.mathLiveItems) ? data.mathLiveItems : [],
  }
}

/** One question body. The two payload shapes come from two different hosts. */
export async function fetchDetail(stub: Stub): Promise<Json> {
  if (stub._path === 'external_id') {
    return post(DETAIL_URL, { external_id: stub._id })
  }
  // The disclosed endpoint returns a one-element array.
  const payload = await request(IBN_URL(stub._id), { method: 'GET' })
  return Array.isArray(payload) ? payload[0] : payload
}
