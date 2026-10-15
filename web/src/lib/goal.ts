/**
 * The student's goal (G-02): a test date, a target score and a daily number of
 * questions, all optional. Kept in store meta on this device only; deleting
 * your data in Settings clears it with the rest, and the backup file carries it.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as api from '../api'
import * as store from './store'

export const GOAL_KEY = store.GOAL_KEY
export const DAILY_DEFAULT = 10
export const TARGETS = Array.from({ length: 13 }, (_, i) => 1000 + i * 50)

export interface Goal {
  /** "YYYY-MM-DD", local. */
  date: string | null
  target: number | null
  /** Questions a day; null switches the ring off. */
  daily: number | null
  updated_at: number
}

/** A date-only string with a time is read as LOCAL midnight; without one, as UTC. */
const parseDay = (s: string) => new Date(`${s}T00:00:00`)

/** Whole local days from today to the date; negative once it has passed. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  return Math.round((parseDay(date).getTime() - today.getTime()) / 86_400_000)
}

/** "Dec 5". */
export const shortDate = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "47 days to Dec 5", or null when there is no date or it has passed. */
export function countdown(goal: Goal | null, now: Date = new Date()): string | null {
  if (!goal?.date) return null
  const n = daysUntil(goal.date, now)
  if (n < 0) return null
  if (n === 0) return `Test day: ${shortDate(goal.date)}`
  return `${n} ${n === 1 ? 'day' : 'days'} to ${shortDate(goal.date)}`
}

/** "Target 1350 · 190 to go", "Target 1350 · reached", or just "Target 1350" before an estimate. */
export function targetLine(goal: Goal | null, total: number | null): string | null {
  if (!goal?.target) return null
  if (total === null) return `Target ${goal.target}`
  return total >= goal.target
    ? `Target ${goal.target} · reached`
    : `Target ${goal.target} · ${goal.target - total} to go`
}

const listeners = new Set<() => void>()
let version = 0
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version

export async function saveGoal(goal: Omit<Goal, 'updated_at'> | null): Promise<void> {
  await store.setMeta(GOAL_KEY, goal ? { ...goal, updated_at: Date.now() } : null)
  version++
  for (const l of listeners) l()
}

/**
 * The saved goal, or null. Re-read after a save and after any progress change,
 * which is how a delete or a restore in Settings reaches the score card.
 */
export function useGoal(): Goal | null {
  const saved = useSyncExternalStore(subscribe, getVersion)
  const progress = useSyncExternalStore(api.onProgress, api.progressVersion)
  const [goal, setGoal] = useState<Goal | null>(null)
  useEffect(() => {
    let stale = false
    store.getMeta<Goal | null>(GOAL_KEY)
      .then((g) => { if (!stale) setGoal(g ?? null) })
      .catch(() => {})
    return () => { stale = true }
  }, [saved, progress])
  return goal
}
