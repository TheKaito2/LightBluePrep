/**
 * Drawing the questions for a practice set.
 *
 * Deliberately random, unlike everything else about ordering in this app. The
 * shuffle key in lib/shuffle.ts exists so that "question 40" means the same
 * question every time; a set is the opposite, and two 20-question Math sets
 * built on the same filters should not be the same 20 questions.
 *
 * The draw happens once, at creation, and the result is frozen into the set,
 * so the set itself is still stable across reloads and devices.
 */

/**
 * `n` items chosen at random, without replacement, order randomised too.
 *
 * A partial Fisher-Yates over a copy: it stops after `n` swaps rather than
 * shuffling the whole pool, which matters because the pool can be 3,767 items
 * and the set is usually 20.
 */
export function sample<T>(pool: readonly T[], n: number, random = Math.random): T[] {
  const wanted = Math.max(0, Math.min(Math.floor(n), pool.length))
  const copy = pool.slice()
  for (let i = 0; i < wanted; i++) {
    // Pick from what is left, then park the winner at the front.
    const j = i + Math.floor(random() * (copy.length - i))
    const tmp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = tmp
  }
  return copy.slice(0, wanted)
}

/**
 * `counts[group]` items from each group of `pool`, each group drawn as `sample`
 * draws, the groups in the order `counts` lists them.
 *
 * The score check needs this: the estimate unlocks per section, and a plain
 * `sample` of 20 from the whole bank can come back 14 and 6, which leaves one
 * section still locked after the student did what the button asked.
 */
export function sampleBalanced<T, K extends string>(
  pool: readonly T[], groupOf: (item: T) => K, counts: Record<K, number>, random = Math.random,
): T[] {
  return (Object.keys(counts) as K[]).flatMap((g) =>
    sample(pool.filter((item) => groupOf(item) === g), counts[g], random))
}
