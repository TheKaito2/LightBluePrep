/**
 * A practice set's lifecycle: starting one, putting it back on screen, holding
 * answers and time as it runs, the countdown, finishing, redoing and dropping.
 * The pure steps are in lib/sets.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { sample, sampleBalanced } from './draw'
import { setSeconds } from './pacing'
import type { View } from './route'
import { commitItem, gradeItems, holdItem, newSet, nowSec, sumSeconds, type GradedCache } from './sets'
import type { Filters, PracticeSet, SetAnswer, SetItem } from '../types'

export type PracticeSetApi = ReturnType<typeof usePracticeSet>

export function usePracticeSet({ view, items, index, setItems, setIndex, navigate, fail, dataVersion }: {
  view: View
  /** The questions on screen and the one showing: a set's frozen list while one runs. */
  items: SetItem[]
  index: number
  setItems: (items: SetItem[]) => void
  setIndex: (index: number) => void
  navigate: (next: View, replace?: boolean) => void
  fail: (e: unknown, retry?: () => void) => void
  /** Bumped by a sync that pulled rows, which can change Home's queue of sets. */
  dataVersion: number
}) {
  const inPractice = view === 'practice'
  /**
   * The set being worked through, if this is a set rather than open practice.
   *
   * Its `items` are the frozen question list AND the progress against them, so
   * everything about a set (which questions, in what order, how far in) lives
   * in this one row and survives a reload or a second device.
   */
  const [activeSet, setActiveSet] = useState<PracticeSet | null>(null)
  /**
   * The same set, readable synchronously.
   *
   * Every write starts from this ref, never from the `activeSet` a handler
   * closed over: two quick answers would otherwise both rebuild `items` from
   * the same render, and the second would drop the first. The
   * practice screen's own effects run before this hook's, so entering a set
   * writes the ref at once rather than waiting for the sync below.
   */
  const activeSetRef = useRef<PracticeSet | null>(null)
  useEffect(() => { activeSetRef.current = activeSet }, [activeSet])
  const enter = useCallback((set: PracticeSet | null) => { activeSetRef.current = set; setActiveSet(set) }, [])
  const [activeSets, setActiveSets] = useState<PracticeSet[]>([])
  /** The finished set being read back on the results screen. */
  const [shownSet, setShownSet] = useState<PracticeSet | null>(null)
  /** Seconds left on the set clock. Null when the set is untimed. */
  const [remaining, setRemaining] = useState<number | null>(null)
  /** Banks the time on the question on screen; the practice screen points it at its own clock. */
  const bank = useRef(() => {})
  const setBank = useCallback((fn: () => void) => { bank.current = fn }, [])
  const shownSetRef = useRef(shownSet)
  useEffect(() => { shownSetRef.current = shownSet }, [shownSet])
  /**
   * Back, Forward or a hash link is changing the view away from `from`.
   * Leaving a set that way must bank the clock the way the in-app back button
   * does; the interval flush only runs every few seconds. Says whether Results
   * can come back: only while its set is still in memory.
   */
  const beforePop = useCallback((from: View) => {
    if (from === 'practice') bank.current()
    return shownSetRef.current !== null
  }, [])

  /**
   * A set only exists while you are in it.
   *
   * Otherwise plain practice opened later from Home, Review or Stats would
   * still run in set mode, with no Submit and nowhere for answers to go. Its
   * progress is saved as you go and Resume reloads it, so dropping it here
   * loses nothing.
   */
  useEffect(() => {
    if (view === 'practice') return
    activeSetRef.current = null
    setActiveSet(null)
  }, [view])

  /** Reload the queue of unfinished sets shown on Home. */
  const refreshActiveSets = useCallback(() => {
    api.listSets(true).then(setActiveSets).catch(() => {})
  }, [])

  useEffect(() => {
    if (view === 'home') refreshActiveSets()
  }, [view, dataVersion, refreshActiveSets])

  /**
   * Freeze drawn questions into a new set and start working through them.
   * `built` is stored as the set's filters, which is what names it later.
   *
   * The draw happens here rather than in a backend because both backends hand
   * the whole pool over anyway, and doing it once on the client is what keeps
   * the two identical.
   */
  const start = useCallback(async (chosen: SetItem[], built: Filters) => {
    try {
      enter(await api.saveSet(newSet(built, chosen.map((q) => q.id))))
      setItems(chosen)
      setIndex(0)
      navigate('practice')
    } catch (e) { fail(e) }
  }, [enter, setItems, setIndex, fail, navigate])

  /** The hero's one-click start: 10 questions from the whole bank, whatever the topic picker says. */
  const quick = useCallback(() => {
    api.questionsById()
      .then((byId) => start(sample([...byId.values()], 10), { size: 10 }))
      .catch((e: Error) => fail(e))
  }, [start, fail])

  /**
   * The locked score card's button: 10 Reading and Writing then 10 Math, so
   * finishing it unlocks both sections. Drawn from questions not tried yet,
   * because only a first try counts toward the estimate.
   */
  const scoreCheck = useCallback(() => {
    api.questionsById()
      .then((byId) => start(
        sampleBalanced([...byId.values()].filter((q) => !q.answered_at), (q) => q.section, { RW: 10, MATH: 10 }),
        { size: 20, title: 'Score check' }))
      .catch((e: Error) => fail(e))
  }, [start, fail])

  /** Put a set's frozen questions back on screen, at the first unanswered one. */
  const open = useCallback(async (id: string) => {
    try {
      const [set, byId] = await Promise.all([api.getSet(id), api.questionsById()])
      // Order comes from the set, not the pool: that is what makes it the same
      // set every time. A question retired since it was drawn simply drops out.
      const ordered = (set.items ?? [])
        .map((i) => byId.get(i.question_id))
        .filter((q): q is SetItem => Boolean(q))
      const firstOpen = (set.items ?? []).findIndex((i) => i.response === null)
      enter(set)
      setItems(ordered)
      setIndex(firstOpen < 0 ? 0 : Math.min(firstOpen, ordered.length - 1))
      navigate('practice')
    } catch (e) { fail(e) }
  }, [enter, setItems, setIndex, fail, navigate])

  /**
   * Drop a set for good, from either list.
   *
   * Deleting the set does not touch the attempts it produced: those are your
   * practice history and belong to the questions, not to the set.
   */
  const drop = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.deleteSet(id)
      if (activeSet?.id === id) enter(null)
      if (shownSet?.id === id) { setShownSet(null); navigate('review') }
      setActiveSets((prev) => prev.filter((s) => s.id !== id))
      refreshActiveSets()
      return true
    } catch (e) { fail(e); return false }
  }, [enter, refreshActiveSets, activeSet, shownSet, fail, navigate])

  /** Write the set's progress back. Called after every answer. */
  const persist = useCallback(async (
    next: SetAnswer[], finished: boolean, spent: number, retry?: () => void,
  ) => {
    const live = activeSetRef.current
    if (!live) return null
    try {
      const saved = await api.saveSet({
        id: live.id,
        created_at: live.created_at,
        finished_at: finished ? nowSec() : null,
        seconds: spent,
        filters: live.filters,
        items: next,
      })
      // Only the finish path writes back. Adopting the server's row after a
      // progress write would undo any answer given while the request was in
      // flight, which is exactly what the HTTP backend's round trip makes easy.
      // The local ref is authoritative for the length of the session.
      if (finished) enter(null)
      return saved
    } catch (e) { fail(e, retry); return null }
  }, [enter, fail])

  /**
   * True while a finish is grading or saving. Every grade writes a new attempt,
   * so a double click on Finish, or the clock running out mid-finish, must not
   * start a second pass.
   */
  const finishingRef = useRef(false)
  const [finishing, setFinishing] = useState(false)
  /**
   * Grades already recorded by a finish that then failed. A retry re-grades
   * only what is missing there, or what was changed since, so it cannot record
   * an attempt twice.
   */
  const gradedRef = useRef<GradedCache>(new Map())

  /** End the set and show the score. */
  const finish = useCallback(async () => {
    const live = activeSetRef.current
    if (!live || finishingRef.current) return
    finishingRef.current = true
    setFinishing(true)
    const retry = () => { void finish() }
    try {
      const spent = live.seconds ?? 0
      // Everything is graded here rather than as it was answered, which is also
      // where the attempts get recorded. A question left blank is not attempted.
      const { items: graded, failure } = await gradeItems(live.id, live.items ?? [], api.answer, gradedRef.current)
      // A question that could not be graded is not wrong: stay in the set and
      // offer Retry rather than score it 0 and move on.
      if (failure) { fail(failure, retry); return }
      const saved = await persist(graded, true, spent, retry)
      if (!saved) return
      gradedRef.current.clear()
      setShownSet(saved)
      setRemaining(null)
      navigate('results', true)
      // Stats and history refetch on Results itself: the grades bumped the progress version.
      refreshActiveSets()
    } finally {
      finishingRef.current = false
      setFinishing(false)
    }
  }, [persist, refreshActiveSets, navigate, fail])

  /**
   * The set clock.
   *
   * Priced per question from the real test's own pace and started when the set
   * is opened, not when it was created, so closing the tab does not run it
   * down. Running out ends the set exactly as finishing it does, which is what
   * the real thing does at the end of a module.
   */
  useEffect(() => {
    if (!inPractice || !activeSet?.filters?.speed) { setRemaining(null); return }
    const sections = items.map((i) => i.section)
    const total = setSeconds(sections, activeSet.filters.speed)
    const left = Math.max(0, total - (activeSet.seconds ?? 0))
    setRemaining(left)
    if (!left) return
    const started = Date.now()
    const tick = setInterval(() => {
      const now = Math.max(0, left - Math.floor((Date.now() - started) / 1000))
      setRemaining(now)
      if (now <= 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
    // activeSet.id rather than activeSet: re-running this on every answer would
    // restart the clock from the top each time.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- activeSet.seconds is read once per set: see above
  }, [inPractice, activeSet?.id, activeSet?.filters?.speed, items])

  useEffect(() => {
    if (remaining === 0 && activeSet) void finish()
  }, [remaining, activeSet, finish])

  /** Open a finished set's score screen from the review page. */
  const show = useCallback(async (id: string) => {
    try {
      setShownSet(await api.getSet(id))
      navigate('results')
    } catch (e) { fail(e) }
  }, [fail, navigate])

  /**
   * Run the same questions again as a NEW set, rather than resetting the old
   * one. The score you already have is history and has to stay put.
   */
  const redo = useCallback(async (old: PracticeSet) => {
    try {
      const full = old.items ? old : await api.getSet(old.id)
      const created = await api.saveSet(newSet(full.filters, (full.items ?? []).map((i) => i.question_id)))
      setShownSet(null)
      await open(created.id)
    } catch (e) { fail(e) }
  }, [fail, open])

  /**
   * Time already banked against the question on screen.
   *
   * The per-question stopwatch restarts at zero every time the question
   * changes, so on its own it reports this visit rather than the total. Adding
   * the banked figure means coming back to a question continues its clock
   * instead of replacing it with a smaller number.
   */
  const currentId = items[index]?.id
  const banked = useRef(0)
  useEffect(() => {
    const row = activeSetRef.current?.items?.find((i) => i.question_id === currentId)
    banked.current = row?.seconds ?? 0
  }, [currentId])

  /** Write `next` into the live set, with the clock that is its sum, and save it. */
  const write = useCallback((live: PracticeSet, next: SetAnswer[]) => {
    const total = sumSeconds(next)
    enter({ ...live, items: next, seconds: total })
    void persist(next, false, total)
  }, [enter, persist])

  /**
   * Write the time spent on the question on screen into the set.
   *
   * Never lowers a question's figure, so revisiting one cannot hand time back.
   */
  const commit = useCallback((spent: number) => {
    const live = activeSetRef.current
    if (!live || !currentId) return
    const next = commitItem(live.items ?? [], currentId, banked.current + spent)
    if (next) write(live, next)
  }, [currentId, write])

  /** Hold an answer to the question on screen. A set grades nothing until it is finished. */
  const hold = useCallback((value: string | null, spent: number) => {
    const live = activeSetRef.current
    if (!live || !currentId) return
    write(live, holdItem(live.items ?? [], currentId, value, banked.current + spent))
  }, [currentId, write])

  return {
    activeSet, activeSetRef, activeSets, shownSet, setShownSet, remaining, finishing, setBank, beforePop,
    start, quick, scoreCheck, open, drop, finish, show, redo, commit, hold,
  }
}
