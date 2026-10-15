import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { fmt, plural } from '../../lib/labels'
import type { Section } from '../../types'

/**
 * The bar pinned to the bottom of Home: what is picked, how many questions
 * that is, the difficulty chips, Options and Start.
 */
export function StartBar({
  sections, summary, canClear, onClear, loading, count, done, onReset, countNews, difficulty,
  optionsOpen, onOptions, hiddenCount, narrowCount, startLabel, onStart,
}: {
  /** The sections the picks fall in, for the coloured dots. */
  sections: Section[]
  summary: string
  canClear: boolean
  onClear: () => void
  loading: boolean
  count: number
  /** How many of `count` are answered. */
  done: number
  onReset: () => void
  /** The count as a sentence, for the live region. */
  countNews: string
  difficulty: ReactNode
  optionsOpen: boolean
  onOptions: () => void
  /** Options changed that the bar does not show; narrowCount adds difficulty, hidden below 1150px. */
  hiddenCount: number
  narrowCount: number
  startLabel: string
  onStart: () => void
}) {
  return (
    <div className="startbar2">
      <div className="startbar2-in">
        <div className="sb-sum">
          <div className="sb-line">
            {sections.map((s) => <i key={s} className={`sb-dot sec-${s}`} aria-hidden="true" />)}
            <strong className="sb-name">{summary}</strong>
            {canClear ? (
              <button type="button" className="sb-clear" aria-label="Clear topics" title="Clear topics"
                      onClick={onClear}>
                <Icon name="close" size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
          {!loading && !count ? (
            <span className="sb-meta sb-none">
              <span aria-hidden="true">
                <span className="sb-none-long">No questions match</span><span className="sb-none-short">No match</span>
                {' · '}
              </span>
              <button type="button" className="sb-reset" onClick={onReset}>Reset filters</button>
            </span>
          ) : (
            <span className="sb-meta" aria-hidden="true">
              {loading ? 'Counting…' : plural(count, 'question')}
              {!loading && done ? ` · ${fmt(done)} answered` : ''}
            </span>
          )}
        </div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{countNews}</span>
        <div className="sb-diff">{difficulty}</div>
        <button className="btn on-ink-secondary sb-opt" onClick={onOptions}
                aria-haspopup="dialog" aria-expanded={optionsOpen}>
          <Icon name="sliders" size={16} />
          <span className="sb-opt-t">Options</span>
          {hiddenCount ? <span className="opt-n wide">{hiddenCount}<span className="sr-only"> changed</span></span> : null}
          {narrowCount ? <span className="opt-n narrow">{narrowCount}<span className="sr-only"> changed</span></span> : null}
        </button>
        <button className="btn on-ink lg sb-go" disabled={!count || loading} onClick={onStart}>
          {startLabel}
          <Icon name="arrow-right" size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
