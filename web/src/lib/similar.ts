/**
 * "Practise similar": questions solved the same way as this one.
 *
 * College Board's skills are too coarse for that, so every question carries a
 * finer process type from public/process-types.json (built by
 * scripts/process_types.py). The file holds only question ids and our own type
 * names, no question text.
 */
import type { SetItem } from '../types'

export interface ProcessType { label: string; how: string }
export interface ProcessTypes {
  /** skill code -> type key -> name and one-line method */
  types: Record<string, Record<string, ProcessType>>
  /** College Board question id -> "skill.key" (inverted from the file on load) */
  q: Record<string, string>
}

/**
 * The file as served: `q` grouped by type ("skill.key" -> ids), which is half
 * the size of one entry per question. A browser can still hold the older
 * per-question file for a day (see _headers), so both shapes are read.
 */
interface ProcessTypesFile {
  types: ProcessTypes['types']
  q: Record<string, string[] | string>
}

/** Back to one entry per question, which is how every caller looks it up. */
export function invertTypes(file: ProcessTypesFile): ProcessTypes {
  const q: Record<string, string> = {}
  for (const [key, value] of Object.entries(file.q)) {
    if (typeof value === 'string') q[key] = value
    else for (const id of value) q[id] = key
  }
  return { types: file.types, q }
}

let loading: Promise<ProcessTypes | null> | null = null

/** One fetch per page load; null if the file is missing, so the UI just hides. */
export function loadProcessTypes(): Promise<ProcessTypes | null> {
  loading ??= fetch(`${import.meta.env.BASE_URL}process-types.json`)
    .then((r) => (r.ok ? r.json() as Promise<ProcessTypesFile> : null))
    .then((file) => (file ? invertTypes(file) : null))
    .catch(() => null)
  return loading
}

export function typeOf(cbId: string | null | undefined, pt: ProcessTypes): ProcessType | null {
  const ref = cbId ? pt.q[cbId] : undefined
  if (!ref) return null
  const dot = ref.lastIndexOf('.')
  return pt.types[ref.slice(0, dot)]?.[ref.slice(dot + 1)] ?? null
}

/** Ref ("skill.key") -> how many questions have that type. */
export function typeCounts(pt: ProcessTypes): Map<string, number> {
  const n = new Map<string, number>()
  for (const ref of Object.values(pt.q)) n.set(ref, (n.get(ref) ?? 0) + 1)
  return n
}

/**
 * Apply the Home type filter. A question is dropped only when its own skill has
 * at least one type picked and its type is not one of them.
 */
export function filterByTypes<T extends Pick<SetItem, 'cb_id' | 'skill'>>(
  items: T[], types: string[], pt: ProcessTypes,
): T[] {
  const picked = new Set(types)
  const narrowed = new Set(types.map((r) => r.slice(0, r.lastIndexOf('.'))))
  return items.filter((i) => !narrowed.has(i.skill) || (i.cb_id != null && picked.has(pt.q[i.cb_id] ?? '')))
}

/** Below this many others of the same type, fall back to the whole skill. */
const MIN_SAME_TYPE = 3

/**
 * Up to `n` questions like `item`: same process type, never itself. Unseen
 * first, then ones last answered wrong, then the rest; closest score band
 * within each.
 */
export function similarTo(item: Pick<SetItem, 'id' | 'cb_id' | 'skill' | 'band'>,
                          pool: SetItem[], pt: ProcessTypes, n = 10): SetItem[] {
  const ref = item.cb_id ? pt.q[item.cb_id] : undefined
  const others = pool.filter((p) => p.id !== item.id)
  let same = ref ? others.filter((p) => p.cb_id && pt.q[p.cb_id] === ref) : []
  if (same.length < MIN_SAME_TYPE) same = others.filter((p) => p.skill === item.skill)
  const status = (p: SetItem) => (p.last_correct === null ? 0 : p.last_correct ? 2 : 1)
  const gap = (p: SetItem) => Math.abs((p.band ?? 4) - (item.band ?? 4))
  return [...same]
    .sort((a, b) => status(a) - status(b) || gap(a) - gap(b))
    .slice(0, n)
}
