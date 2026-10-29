/**
 * The numbers progress moves: the taxonomy with its per-skill counts, the
 * lifetime stats and the attempt history behind streaks and the score.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as api from '../api'
import type { HistoryRow } from './progress'
import type { View } from './route'
import type { Stats, TaxonomyRow } from '../types'

/**
 * The pages that refetch the taxonomy and history after progress changes:
 * the three that show them (Home's counts, Stats, a set's streak and gains on
 * Results) and Review, the page Results and a reviewed question return to, so
 * the numbers are already fresh by the time Home or Stats is opened from it.
 */
const PROGRESS_VIEWS = new Set<View>(['home', 'stats', 'review', 'results'])

export function useProgress(view: View, fail: (e: unknown, retry?: () => void) => void) {
  /** Bumped by an answer, a flag, a pull or a delete; drives the refetch below. */
  const progressVersion = useSyncExternalStore(api.onProgress, api.progressVersion)
  const [taxonomy, setTaxonomy] = useState<TaxonomyRow[]>([])
  /** True from the start of a taxonomy fetch until it settles, so Home can tell loading from failed. */
  const [taxonomyLoading, setTaxonomyLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [attemptLog, setAttemptLog] = useState<HistoryRow[]>([])
  /** Bumped by Retry to re-run the read. */
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  /**
   * Re-read the taxonomy and history when progress has changed since they were
   * last read, once you are on a page that shows them.
   *
   * Once on mount was too little: answering updated the stores but nothing told
   * React, so "Bank progress" and Stats kept their page-load numbers. On every
   * page switch was too much: About to Settings re-walked all 3,767 questions
   * and every attempt for numbers that had not moved (PF-16). Practice is
   * excluded because the numbers are not on screen there and the set list
   * would refetch under you mid-question. The first read happens on whichever
   * page you land on, since About shows the totals.
   */
  const fetchedFor = useRef<string | null>(null)
  const fetchSeq = useRef(0)
  useEffect(() => {
    if (view === 'practice') return
    const key = `${progressVersion}:${reloadKey}`
    if (fetchedFor.current === key) return
    if (fetchedFor.current !== null && !PROGRESS_VIEWS.has(view)) return
    fetchedFor.current = key
    // Not cancelled by leaving the page: the numbers are kept for the next
    // one, and only a newer read supersedes this one.
    const seq = ++fetchSeq.current
    const latest = () => seq === fetchSeq.current
    setTaxonomyLoading(true)
    api.taxonomy()
      .then((d) => {
        if (!latest()) return
        setTaxonomy(d.taxonomy); setStats(d.stats)
      })
      .catch((e: Error) => {
        if (!latest()) return
        fetchedFor.current = null // so the next page tries again
        fail(e, reload)
      })
      .finally(() => { if (latest()) setTaxonomyLoading(false) })
    // Streaks and the score estimate on Home read every attempt.
    api.history()
      .then((d) => { if (latest()) setAttemptLog(d.history) })
      .catch(() => {})
  }, [view, progressVersion, reloadKey, fail, reload])

  return { taxonomy, taxonomyLoading, stats, setStats, attemptLog, reload }
}
