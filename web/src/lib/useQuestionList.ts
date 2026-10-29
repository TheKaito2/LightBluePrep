/**
 * Home's picks and the questions they select, in the chosen order: also the
 * list practice steps through, which opening a set or one question replaces.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { arrange, type Order } from './order'
import { loadFilters, loadOrder, saveFilters, saveOrder } from './prefs'
import type { View } from './route'
import type { Filters, SetItem } from '../types'

export function useQuestionList({ view, dataVersion, fail }: {
  view: View
  /** Bumped by a sync that pulled rows; reloads the list. */
  dataVersion: number
  fail: (e: unknown, retry?: () => void) => void
}) {
  // Home's picks survive a reload (H-32). Read once, before the first render.
  const [storedFilters] = useState(loadFilters)
  const [filters, setFilters] = useState<Filters>(() => storedFilters ?? {})
  useEffect(() => saveFilters(filters), [filters])
  const [items, setItems] = useState<SetItem[]>([])
  const [index, setIndex] = useState(0)
  const [listLoading, setListLoading] = useState(true)

  /** Home list order; `seed` changes each time Reshuffle is pressed. Both kept across reloads. */
  const [storedOrder] = useState(loadOrder)
  const [order, setOrder] = useState<Order>(storedOrder.order)
  const [seed, setSeed] = useState(storedOrder.seed)
  useEffect(() => saveOrder({ order, seed }), [order, seed])
  const reorder = useCallback((next: Order) => {
    setOrder(next)
    if (next === 'random') setSeed(crypto.randomUUID())
  }, [])

  // Named so the Retry it hands the banner can call it again.
  const loadList = useCallback(function load() {
    let stale = false
    setListLoading(true)
    api.questionSet(filters)
      .then((d) => { if (!stale) { setItems(arrange(d.questions, order, seed)); setIndex(0) } })
      .catch((e: Error) => !stale && fail(e, () => { load() }))
      .finally(() => { if (!stale) setListLoading(false) })
    return () => { stale = true }
  }, [filters, order, seed, fail])

  useEffect(loadList, [loadList])

  /**
   * The pool under difficulty, status and skip-live alone, ignoring the picked
   * topics, so every skill row on Home can say how many of its questions the
   * active filters leave ("87 hard"). `items` cannot: it holds only the ticked
   * skills. Skipped when no such filter is set, since the row totals are then
   * the answer.
   */
  const [facetItems, setFacetItems] = useState<SetItem[] | null>(null)
  useEffect(() => {
    if (view !== 'home' || (!filters.difficulties?.length && !filters.statuses?.length)) return
    let stale = false
    api.questionSet({ difficulties: filters.difficulties, statuses: filters.statuses, excludeLive: filters.excludeLive })
      .then((d) => { if (!stale) setFacetItems(d.questions) })
      // The counts are a hint; the start bar already shows the real total.
      .catch(() => { if (!stale) setFacetItems(null) })
    return () => { stale = true }
  }, [view, filters.difficulties, filters.statuses, filters.excludeLive, dataVersion])

  // Landing back on Home reloads the list: answers since then change its status
  // marks, and opening one question or a set replaced `items` with just those.
  const mounted = useRef(false)
  useEffect(() => {
    // The effect above already loaded on mount.
    if (!mounted.current) { mounted.current = true; return }
    if (view === 'home') return loadList()
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- loadList is left out: the effect above already runs it when the filters change
  }, [view, dataVersion])

  return {
    filters, setFilters, items, setItems, index, setIndex, listLoading, loadList, order, seed, reorder,
    facet: filters.difficulties?.length || filters.statuses?.length ? facetItems : null,
  }
}
