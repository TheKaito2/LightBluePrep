/**
 * The score card on the Home hero (spec 8.1): the estimated score with its
 * trend and section rows, or, before there is an estimate, what unlocks it;
 * then streak, coverage and accuracy in one hairline-divided footer. Numbers
 * come from lib/progress.ts; this only draws them.
 */
import { Icon } from './Icon'
import { Stat } from './Stat'
import { score, streak, UNLOCK_AFTER, type HistoryRow } from '../lib/progress'
import { SECTIONS, SECTION_NAME, SECTION_SHORT, fmt, noun } from '../lib/labels'
import { graded } from '../lib/score'
import type { Section } from '../types'

/** Two letters, so Tuesday and Thursday (and the weekend) stop sharing one. */
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface Props {
  history: HistoryRow[]
  covered: number
  total: number
  /** Every answer and every correct one, for the accuracy cell. */
  attempts: number
  correct: number
  /** Start the balanced 20-question set that unlocks the estimate. */
  onScoreCheck: () => void
}

/** Tiny line chart of the total over time. Inline SVG, stroke only. */
function Sparkline({ values }: { values: number[] }) {
  const w = 120, h = 40, pad = 4
  const lo = Math.min(...values), hi = Math.max(...values)
  const span = Math.max(hi - lo, 40)
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (values.length - 1)
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" className="spark-dot" />
    </svg>
  )
}

/** One section row: its score on the 200-800 scale, or how far it is from unlocking. */
function SectionRow({ section, value, counted }: {
  section: Section; value: number | null; counted: number
}) {
  const fill = value === null ? Math.min(counted, UNLOCK_AFTER) / UNLOCK_AFTER : (value - 200) / 600
  return (
    <div className={`secscore sec-${section}`}>
      <span className="secscore-l">
        <span className="long">{SECTION_NAME[section]}</span><span className="short">{SECTION_SHORT[section]}</span>
      </span>
      <span className="secscore-bar"><span style={{ transform: `scaleX(${fill})` }} /></span>
      {value !== null
        ? <span className="secscore-n">{value}</span>
        : <span className="secscore-count">{Math.min(counted, UNLOCK_AFTER)} of {UNLOCK_AFTER} answered</span>}
    </div>
  )
}

export function ProgressStrip({ history, covered, total, attempts, correct, onScoreCheck }: Props) {
  const now = new Date()
  // A few thousand rows at most: cheap enough to recompute every render.
  const st = streak(history, now)
  const sc = score(history, now)
  const trend = sc.series.filter((p) => p.total !== null).map((p) => p.total as number).slice(-30)
  const acc = graded(attempts, correct)

  return (
    <div className="scard-wrap">
      <section className="scard" aria-label="Your progress">
        {sc.total !== null ? (
          <>
            <div className="scard-top">
              <span className="scard-l"
                    title="From your first try at each question, weighted by difficulty.">
                Estimated score
              </span>
              {sc.delta7 ? (
                <span className={sc.delta7 > 0 ? 'delta up' : 'delta down'}>
                  <Icon name={sc.delta7 > 0 ? 'trend-up' : 'trend-down'} size={14} strokeWidth={2.2} />
                  {sc.delta7 > 0 ? '+' : '−'}{Math.abs(sc.delta7)} this week
                </span>
              ) : null}
            </div>
            <div className="scard-mid">
              <span className="scard-big">{sc.total}<small>/ 1600</small></span>
              {trend.length > 1 ? <Sparkline values={trend} /> : null}
            </div>
          </>
        ) : (
          <div className="scard-lock">
            <span className="scard-lock-ico"><Icon name="lock" size={18} strokeWidth={2} /></span>
            <div>
              <h2 className="scard-lock-t">Unlock your score estimate</h2>
              <p className="scard-lock-sub">Answer {UNLOCK_AFTER} questions in each section.</p>
            </div>
          </div>
        )}
        <div className="secscores">
          {SECTIONS.map((s) => (
            <SectionRow key={s} section={s} value={s === 'RW' ? sc.rw : sc.math} counted={sc.counted[s]} />
          ))}
        </div>
        {sc.total === null ? (
          <button className="btn primary scard-go" onClick={onScoreCheck}>
            Get your score: 20 questions
            <Icon name="arrow-right" size={16} strokeWidth={2.2} />
          </button>
        ) : null}

        <div className="scard-stats">
          {/* Built by hand rather than with <Stat>: the day dots are a list, and a
              list cannot sit in Stat's inline sub line. */}
          <div className={`stat st-streak${st.atRisk ? ' at-risk' : ''}${st.current ? '' : ' none'}`}>
            <span className="stat-l">Streak</span>
            <span className="stat-n">
              <Icon name="flame" size={20} strokeWidth={2.2} />{fmt(st.current)}<small>{noun(st.current, 'day')}</small>
            </span>
            <ul className="days" aria-label="Last seven days">
              {st.last7.map((on, i) => {
                const d = new Date(now); d.setDate(d.getDate() - (6 - i))
                const day = d.toLocaleDateString('en', { weekday: 'long' })
                const today = i === 6
                return (
                  <li key={i} className={on ? 'day on' : today ? 'day today' : 'day'}>
                    <span aria-hidden="true">{DAY_SHORT[d.getDay()]}</span>
                    <span className="sr-only">
                      {today ? `Today, ${day}` : day}: {on ? 'practised' : today ? 'not yet' : 'missed'}
                    </span>
                  </li>
                )
              })}
            </ul>
            {st.atRisk ? (
              <span className="stat-sub streak-risk">Keep your {st.current}-day streak: answer 1 today</span>
            ) : null}
          </div>
          <Stat label="Covered" value={fmt(covered)} sub={`of ${fmt(total)}`}
                meter={total ? covered / total : 0} />
          <Stat label="Accuracy" value={acc ? acc.pct : undefined} unit={acc ? '%' : undefined}
                sub={acc ? undefined : 'After 5 answers'} />
        </div>
      </section>
      <p className="scard-note">Practice estimate, not an official score.</p>
    </div>
  )
}
