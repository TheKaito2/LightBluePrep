/**
 * Which screen is showing, and how it maps to the address bar.
 *
 * Hash routes rather than paths: Pages serves one index.html, and a hash never
 * reaches the server, so a reload or a shared link needs no rewrite rules.
 * Practice and Results have no route of their own: what they show lives in
 * memory, so they keep the URL of the page they were opened from and a reload
 * lands back there.
 */
import { fmt } from './labels'

export type View =
  | 'home' | 'practice' | 'results' | 'plan' | 'review' | 'stats'
  | 'resources' | 'about' | 'settings' | 'inbox'

const ROUTED = ['plan', 'review', 'stats', 'resources', 'about', 'settings', 'inbox'] as const

/** The view a hash names. Home for no hash and for anything unknown. */
export function parseHash(hash: string): View {
  const name = hash.replace(/^#/, '')
  return (ROUTED as readonly string[]).includes(name) ? name as View : 'home'
}

/** The hash for a view: '' for Home, null for views that keep the current URL. */
export function formatHash(view: View): string | null {
  if (view === 'practice' || view === 'results') return null
  return view === 'home' ? '' : `#${view}`
}

/** The address to show for `view`, given the one showing now. */
export function urlFor(view: View, current: string): URL {
  const url = new URL(current)
  const hash = formatHash(view)
  if (hash !== null) url.hash = hash
  return url
}

const NAMES: Record<View, string> = {
  home: '', practice: 'Practice', results: 'Results', plan: 'Plan', review: 'Review',
  stats: 'Stats', resources: 'Resources', about: 'About', settings: 'Settings',
  inbox: 'Inbox',
}

/**
 * The tab title. Home gets `home`, the index.html title; practice names the
 * question and the set so history and tabs can tell two sessions apart.
 */
export function titleFor(view: View, home: string,
  practice?: { index: number; count: number; set: string }): string {
  if (view === 'home') return home
  if (view === 'practice' && practice?.count) {
    return `Question ${fmt(practice.index + 1)} of ${fmt(practice.count)} · ${practice.set} · LightBluePrep`
  }
  return `${NAMES[view]} · LightBluePrep`
}

/**
 * The College Board ID a search box was given, lowercased: what was typed, or
 * the `q` of a pasted share link (".../?q=d72b325e").
 */
export function idNeedle(raw: string): string {
  const s = raw.trim()
  const m = /[?&]q=([^&#\s]+)/.exec(s)
  if (!m) return s.toLowerCase()
  const q = m[1]!
  try { return decodeURIComponent(q).trim().toLowerCase() } catch { return q.toLowerCase() }
}
