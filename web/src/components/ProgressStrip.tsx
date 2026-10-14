/**
 * Progress at the top of Home: the estimated score (wide, left) beside the
 * streak and bank coverage (stacked, right). Numbers come from
 * lib/progress.ts; this only draws them.
 */
import { Icon } from './Icon'
import { score, streak, UNLOCK_AFTER, type HistoryRow } from '../lib/progress'
import type { Section } from '../types'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface Props {
  history: HistoryRow[]
  covered: number
  total: number
  accuracy: number | null
}

/** Tiny line chart of the total over time. Inline SVG, no chart library. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 240, h = 52, pad = 4
  const lo = Math.min(...values), hi = Math.max(...values)
  const span = Math.max(hi - lo, 40)
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (values.length - 1)
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L${x(values.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} className="spark-area" />
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.2" className="spark-dot" />
    </svg>
  )
}

/** One section's estimate as a bar on the 200-800 scale, or how far to unlock. */
function SectionScore({ section, label, short, value, counted }: {
  section: Section; label: string; short: string; value: number | null; counted: number
}) {
  const fill = value === null ? 0 : (value - 200) / 600
  return (
    <div className={`secscore sec-${section}`}>
      <span className="secscore-l"><span className="long">{label}</span><span className="short">{short}</span></span>
      <span className="secscore-bar"><span style={{ transform: `scaleX(${fill})` }} /></span>
      {value !== null ? (
        <span className="secscore-n">{value}</span>
      ) : (
        <span className="secscore-lock">
          <Icon name="lock" size={13} strokeWidth={2} />
          {Math.max(0, UNLOCK_AFTER - counted)} to go
        </span>
      )}
    </div>
  )
}

export function ProgressStrip({ history, covered, total, accuracy }: Props) {
  const now = new Date()
  // A few thousand rows at most: cheap enough to recompute every render.
  const st = streak(history, now)
  const sc = score(history, now)
  const trend = sc.series.filter((p) => p.total !== null).map((p) => p.total as number).slice(-30)

  return (
    <section className="pstrip" aria-label="Your progress">
      <div className="pcard pcard-score">
        <div className="pcard-top">
          <span className="pcard-ico ico-score"><Icon name="target" size={16} strokeWidth={2} /></span>
          <span className="pcard-l"
                title="Practice estimate from your first try at each question, weighted by difficulty. Not an official SAT score.">
            Estimated score
          </span>
          {sc.delta7 ? (
            <span className={sc.delta7 > 0 ? 'delta up' : 'delta down'}>
              <Icon name={sc.delta7 > 0 ? 'trend-up' : 'trend-down'} size={14} strokeWidth={2.2} />
              {sc.delta7 > 0 ? '+' : '−'}{Math.abs(sc.delta7)} this week
            </span>
          ) : null}
        </div>
        <div className="pcard-mid">
          <div className={sc.total !== null ? 'pcard-big' : 'pcard-big pcard-locked'}>
            {sc.total ?? '—'}<span className="pcard-unit">/ 1600</span>
          </div>
          {trend.length > 1 ? <Sparkline values={trend} /> : null}
        </div>
        <div className="secscores">
          <SectionScore section="RW" label="Reading & Writing" short="R&W" value={sc.rw} counted={sc.counted.RW} />
          <SectionScore section="MATH" label="Math" short="Math" value={sc.math} counted={sc.counted.MATH} />
        </div>
        <span className="pcard-sub pcard-note">
          {sc.total === null
            ? `Unlocks after ${UNLOCK_AFTER} questions in each section.`
            : trend.length > 1 ? 'Practice estimate, not an official score.'
              : 'Your trend line starts after a second day of practice.'}
        </span>
      </div>

      <div className="pcard pcard-streak">
        <div className="pcard-top">
          <span className={st.current ? 'pcard-ico ico-streak on' : 'pcard-ico ico-streak'}>
            <Icon name="flame" size={16} strokeWidth={2} />
          </span>
          <span className="pcard-l">Streak</span>
        </div>
        <div className="pcard-big">
          {st.current}<span className="pcard-unit">day{st.current === 1 ? '' : 's'}</span>
        </div>
        <div className="days" aria-label="Last seven days">
          {st.last7.map((on, i) => {
            const d = new Date(now); d.setDate(d.getDate() - (6 - i))
            return (
              <span key={i} className={on ? 'day on' : i === 6 ? 'day today' : 'day'}
                    title={d.toLocaleDateString(undefined, { weekday: 'long' })}>
                {DAY_LETTERS[d.getDay()]}
              </span>
            )
          })}
        </div>
        <span className="pcard-sub">
          {st.today
            ? `${st.today} answered today`
            : st.atRisk ? 'Answer one today to keep it going' : 'Answer a question to start one'}
          {st.best > 1 ? ` · best ${st.best}` : ''}
        </span>
      </div>

      <div className="pcard pcard-cover">
        <div className="pcard-top">
          <span className="pcard-ico ico-cover"><Icon name="layers" size={16} strokeWidth={2} /></span>
          <span className="pcard-l">Bank covered</span>
        </div>
        <div className="pcard-big">
          {covered.toLocaleString()}<span className="pcard-unit">/ {total.toLocaleString()}</span>
        </div>
        <span className="meter cover-meter"><span className="meter-fill"
          style={{ width: `${Math.max(total ? (covered / total) * 100 : 0, 0.4)}%` }} /></span>
        <span className="pcard-sub">
          {accuracy !== null ? `${Math.round(accuracy * 100)}% correct` : 'Nothing answered yet'}
        </span>
      </div>
    </section>
  )
}
