import { Icon } from '../Icon'
import { SECTION_ICON, SECTION_NAME, SECTION_SHORT } from '../../lib/labels'
import type { Section } from '../../types'

/** The Topics heading and the All / Reading and Writing / Math tabs. */
export function TopicsHead({ section, onPick }: {
  section: Section | undefined
  onPick: (sec: Section | undefined) => void
}) {
  const tabs: { key: Section | undefined; label: string; short: string }[] = [
    { key: undefined, label: 'All', short: 'All' },
    { key: 'RW', label: SECTION_NAME.RW, short: SECTION_SHORT.RW },
    { key: 'MATH', label: SECTION_NAME.MATH, short: SECTION_SHORT.MATH },
  ]
  return (
    <div className="topics-head">
      {/* The hero's line is the visible heading; this one names the region. */}
      <h2 className="sr-only" id="topics-title" tabIndex={-1}>Topics</h2>
      <div className="seg sectabs" role="group" aria-label="Section">
        {tabs.map((t) => (
          <button key={t.label} aria-pressed={section === t.key}
                  className={`seg-b${t.key ? ` sec-${t.key}` : ''}${section === t.key ? ' on' : ''}`}
                  onClick={() => onPick(t.key)}>
            {t.key ? <Icon name={SECTION_ICON[t.key]} size={15} strokeWidth={2} /> : null}
            <span className="long">{t.label}</span><span className="short">{t.short}</span>
          </button>
        ))}
      </div>
      {/* The static skill pages are the only indexable content; link them. */}
      <a className="link topics-browse" href="/skills/">Browse by skill</a>
    </div>
  )
}
