import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { DIFFICULTY_NAME, fmt, plural } from '../../lib/labels'
import { idNeedle } from '../../lib/route'
import type { SetItem } from '../../types'

interface Found { needle: string; hits: SetItem[]; total: number }

/**
 * The last ID search narrowed to a longer needle, shown while the new search
 * waits out its debounce so the list does not blink away on every keystroke.
 * Only when the last answer was complete: otherwise the new total is unknown.
 */
function refine(found: Found, needle: string): Found | null {
  if (!needle.startsWith(found.needle) || found.total > found.hits.length) return null
  const hits = found.hits.filter((q) => (q.cb_id ?? '').toLowerCase().startsWith(needle))
  return { needle, hits, total: hits.length }
}

/** "Have a question ID from a video?": a combobox over College Board IDs. "/" focuses it. */
export function IdSearch({ findIds, onOpenId }: {
  /** The first few questions whose College Board ID matches, exact first, and how many match. */
  findIds: (needle: string) => Promise<{ hits: SetItem[]; total: number }>
  onOpenId: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  /** Hits for the needle they were found for, so a stale list never answers a newer query. */
  const [found, setFound] = useState<Found | null>(null)
  /** The hit Arrow keys have moved to, -1 for none. */
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const needle = idNeedle(query)
  const matches = needle.length < 3 || !found ? null
    : found.needle === needle ? found
      : refine(found, needle)

  // Look across the whole bank once the ID is long enough to mean something.
  useEffect(() => {
    setActive(-1)
    if (needle.length < 3) return
    let stale = false
    // Typing an 8-character ID is 6 searches otherwise; wait for a pause.
    const t = window.setTimeout(() => {
      findIds(needle).then((d) => { if (!stale) setFound({ needle, ...d }) }).catch(() => {})
    }, 120)
    return () => { stale = true; window.clearTimeout(t) }
  }, [needle, findIds])

  // "/" jumps to the ID search from anywhere on Home that is not a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal')) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const shownHits = matches?.hits ?? []
  /**
   * Spoken by a live region that is always in the page: one that mounts with
   * its first message is often not heard at all.
   */
  const matchNews = !matches ? ''
    : !matches.total ? `No question with ID ${needle}`
      : matches.total > shownHits.length ? `${plural(matches.total, 'match', 'matches')}, first ${shownHits.length} shown`
        : plural(matches.total, 'match', 'matches')

  function submit() {
    if (!matches?.total) return
    if (active >= 0 && shownHits[active]) { onOpenId(shownHits[active].id); return }
    // findIds puts an exact match first.
    if (matches.total === 1 || shownHits[0].cb_id?.toLowerCase() === needle) { onOpenId(shownHits[0].id); return }
    setActive(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); setActive(-1); return }
    if (!shownHits.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    setOpen(true)
    const n = shownHits.length
    setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)))
  }

  return (
    <form className="qsearch-f" role="search" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label className="qsearch-l" htmlFor="qsearch">Have a question ID from a video?</label>
      <div className="qsearch">
        <Icon name="search" size={18} strokeWidth={2} />
        <input ref={input} id="qsearch" type="search" value={query}
               placeholder="Question ID, e.g. d72b325e"
               role="combobox" aria-autocomplete="list" aria-controls="idres"
               aria-expanded={open && shownHits.length > 0}
               aria-activedescendant={open && active >= 0 ? `idhit-${active}` : undefined}
               autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
               onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
               onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
               onKeyDown={onKeyDown} />
        <kbd className="qsearch-kbd" aria-hidden="true">/</kbd>
      </div>
      {open && matches ? (
        <div className="idres">
          {shownHits.length ? (
            <ul id="idres" role="listbox" aria-label="Questions with this ID">
              {shownHits.map((q, i) => (
                // The input keeps focus (aria-activedescendant), so a press
                // must not blur it before the click lands.
                <li key={q.id} id={`idhit-${i}`} role="option" aria-selected={i === active}
                    className={i === active ? 'idhit on' : 'idhit'}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => onOpenId(q.id)}>
                  <code className="qid">{q.cb_id}</code>
                  <span className="idhit-s">{q.skill_name}</span>
                  <span className={`lvl d-${q.difficulty}`}>{DIFFICULTY_NAME[q.difficulty]}</span>
                  <Icon name="arrow-right" size={15} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="idnote">
            {!matches.total
              ? <>No question with ID “{needle}”. IDs are 8 characters, shown under Info on any question.</>
              : matches.total > shownHits.length ? `and ${fmt(matches.total - shownHits.length)} more, keep typing` : null}
          </p>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{matchNews}</span>
    </form>
  )
}
