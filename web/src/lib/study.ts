/**
 * The study row: the goal (lib/goal.ts) and the plan (lib/plan.ts), kept as
 * ONE record so they sync together and the plan reads its test date and
 * target from the same place the score card does.
 *
 * Stored in meta under STUDY_KEY with an updated_at, last write wins, like a
 * mark. Signed in, every save is queued for sync ('study:me'). Before this row
 * existed the goal lived alone under GOAL_KEY; that is read once as a fallback.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as api from '../api'
import * as store from './store'
import * as sync from './sync'
import type { Goal } from './goal'
import { markFinished, type Plan } from './plan'

export interface Study { goal: Goal | null; plan: Plan | null; updated_at: number }

const EMPTY: Study = { goal: null, plan: null, updated_at: 0 }

export async function loadStudy(): Promise<Study> {
  const row = await store.loadStudy()
  if (row) return row as Study
  const legacy = await store.getMeta<Goal>(store.GOAL_KEY)
  return legacy ? { ...EMPTY, goal: legacy } : EMPTY
}

const listeners = new Set<() => void>()
let version = 0
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version

/** Change the goal, the plan or both; the other half is kept as stored. */
export async function saveStudy(patch: Partial<Pick<Study, 'goal' | 'plan'>>): Promise<Study> {
  const current = await loadStudy()
  const saved = await store.saveStudy({ goal: current.goal, plan: current.plan, ...patch }) as Study
  sync.track('study', 'me')
  version++
  for (const l of listeners) l()
  return saved
}

/**
 * The stored row. Re-read after a save and after any progress change, which is
 * how a sync pull, a restore or a delete in Settings reaches the screen.
 */
export function useStudy(): Study & { loaded: boolean } {
  const saved = useSyncExternalStore(subscribe, getVersion)
  const progress = useSyncExternalStore(api.onProgress, api.progressVersion)
  // `loaded` stays false until the first read, so "no plan yet" never flashes
  // for someone who has one.
  const [study, setStudy] = useState<Study & { loaded: boolean }>({ ...EMPTY, loaded: false })
  useEffect(() => {
    let stale = false
    loadStudy().then((s) => { if (!stale) setStudy({ ...s, loaded: true }) })
      .catch(() => { if (!stale) setStudy({ ...EMPTY, loaded: true }) })
    return () => { stale = true }
  }, [saved, progress])
  return study
}

/** Save or clear the plan, keeping the goal as stored. */
export const savePlan = (plan: Plan | null) => saveStudy({ plan })

/**
 * Close every session whose practice set has been finished since. Runs when the
 * Plan page or Home opens, so a set finished anywhere (another device included)
 * ticks its session off. Writes only when something changed.
 */
export async function closeFinishedSessions(): Promise<void> {
  const study = await loadStudy()
  if (!study.plan) return
  const sets = await api.listSets(false, 500)
  const finished = new Map(sets.flatMap((x) => (x.finished_at ? [[x.id, x.finished_at] as const] : [])))
  const next = markFinished(study.plan, finished)
  if (next !== study.plan) await saveStudy({ plan: next })
}
