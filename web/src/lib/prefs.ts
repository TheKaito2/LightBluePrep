/**
 * Home's picks (topics, difficulty, session length, timer, order) kept in
 * localStorage, so a reload or tomorrow's visit starts where you left them.
 *
 * localStorage rather than the IndexedDB store: these are a convenience for
 * this browser, read synchronously before the first render so Home never
 * flashes the defaults, and never synced. Every access is guarded, since
 * private windows and blocked site data throw on it; the picks then simply
 * last for the tab.
 */
import { SPEEDS } from './pacing'
import type { Order } from './order'
import type { Filters } from '../types'

export const FILTERS_KEY = 'lbp.home.filters'
export const ORDER_KEY = 'lbp.home.order'

/** Session lengths Home offers. 0 is "no limit". */
export const SIZES = [0, 10, 20, 30, 50] as const

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch { return null }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* blocked or full: the picks last for this tab */ }
}

const strings = (v: unknown) =>
  Array.isArray(v) && v.length && v.every((x) => typeof x === 'string') ? v as string[] : undefined
const oneOf = <T,>(allowed: readonly T[], v: unknown) =>
  Array.isArray(v) && v.length && v.every((x) => allowed.includes(x)) ? v as T[] : undefined

/**
 * Only the fields Home sets, each checked: what is stored may come from an
 * older build, or have been edited by hand.
 */
export function parseFilters(raw: unknown): Filters | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  return {
    section: r.section === 'RW' || r.section === 'MATH' ? r.section : undefined,
    domains: strings(r.domains),
    skills: strings(r.skills),
    types: strings(r.types),
    difficulties: oneOf(['E', 'M', 'H'] as const, r.difficulties),
    statuses: oneOf(['unseen', 'wrong', 'correct', 'flagged'] as const, r.statuses),
    excludeLive: r.excludeLive === true || undefined,
    size: SIZES.includes(r.size as never) && r.size ? r.size as number : undefined,
    speed: SPEEDS.includes(r.speed as never) ? r.speed as number : undefined,
  }
}

/** The stored picks, or null on a first visit (or when storage is unreadable). */
export const loadFilters = (): Filters | null => parseFilters(read(FILTERS_KEY))

/** Set-only fields (a set's title, its skill names) are not Home picks. */
export function saveFilters(f: Filters) {
  write(FILTERS_KEY, parseFilters(f) ?? {})
}

export interface OrderPref { order: Order; seed: string }

export function loadOrder(): OrderPref {
  const r = read(ORDER_KEY) as Partial<OrderPref> | null
  const order = r?.order === 'topic' || r?.order === 'random' ? r.order : 'mixed'
  // A reshuffle keeps its seed, so the new order is also the same every visit.
  return { order, seed: order === 'random' && typeof r?.seed === 'string' ? r.seed : '' }
}

export const saveOrder = (pref: OrderPref) => write(ORDER_KEY, pref)
