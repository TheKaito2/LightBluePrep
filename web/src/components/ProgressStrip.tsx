/**
 * The score card on the Home hero (spec 8.1): the estimated score with its
 * trend and section rows, or, before there is an estimate, what unlocks it;
 * then streak, coverage and accuracy in one hairline-divided footer. Numbers
 * come from lib/progress.ts; this only draws them.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { GoalDialog } from './GoalDialog'
import { ReminderDialog } from './ReminderDialog'
import { NoData, Stat } from './Stat'
import { score, streak, UNLOCK_AFTER, type HistoryRow } from '../lib/progress'
import { SECTIONS, SECTION_NAME, SECTION_SHORT, fmt, noun, plural } from '../lib/labels'
import { graded } from '../lib/score'
import { useShareCard } from '../lib/share'
import { countdown, targetLine, useGoal } from '../lib/goal'
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

/**
 * Tiny line chart of the total over time. Inline SVG, stroke only. A target
 * widens the range to include it, so the dashed tick shows the real gap.
 */
function Sparkline({ values, target }: { values: number[]; target: number | null }) {
  const w = 120, h = 40, pad = 4
  const all = target ? [...values, target] : values
  const lo = Math.min(...all), hi = Math.max(...all)
  const span = Math.max(hi - lo, 40)
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (values.length - 1)
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {target ? <path d={`M0,${y(target).toFixed(1)} H${w}`} className="spark-target" /> : null}
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="3" className="spark-dot" />
    </svg>
  )
}

/** The streak flame inside a ring that fills with today's answers toward the daily goal. */
function DailyRing({ done, goal }: { done: number; goal: number }) {
  const r = 12.5, c = 2 * Math.PI * r
  const left = c * (1 - Math.min(done / goal, 1))
  return (
    <span className={done >= goal ? 'st-ring met' : 'st-ring'} role="img"
          aria-label={`Today: ${Math.min(done, goal)} of ${goal} questions`}>
      <svg viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r={r} className="st-ring-track" />
        <circle cx="15" cy="15" r={r} className="st-ring-fill"
                strokeDasharray={c.toFixed(2)} strokeDashoffset={left.toFixed(2)} />
      </svg>
      <Icon name="flame" size={16} strokeWidth={2.2} />
    </span>
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
  const card = useShareCard()
  const goal = useGoal()
  const [dialog, setDialog] = useState<'goal' | 'remind' | null>(null)
  const until = countdown(goal, now)
  const toGo = targetLine(goal, sc.total)
  const goalRow = (
    <div className="scard-goal">
      {until || toGo ? (
        <>
          {toGo ? <span className="scard-goal-i"><Icon name="target" size={16} />{toGo}</span> : null}
          {until ? <span className="scard-goal-i"><Icon name="calendar" size={16} />{until}</span> : null}
          <button type="button" className="link scard-goal-edit" onClick={() => setDialog('goal')}>Edit goal</button>
        </>
      ) : (
        <button type="button" className="link scard-goal-edit" onClick={() => setDialog('goal')}>
          <Icon name="target" size={16} />
          Set your goal: test date and target
        </button>
      )}
    </div>
  )

  return (
    <div className="scard-wrap">
      <section className="scard" aria-label="Your progress">
        {sc.total !== null ? (
          <>
            <div className="scard-top">
              <span className="scard-l">Estimated score</span>
              {sc.delta7 ? (
                <span className={sc.delta7 > 0 ? 'delta up' : 'delta down'}>
                  <Icon name={sc.delta7 > 0 ? 'trend-up' : 'trend-down'} size={14} strokeWidth={2.2} />
                  {sc.delta7 > 0 ? '+' : '−'}{Math.abs(sc.delta7)} this week
                </span>
              ) : null}
            </div>
            <div className="scard-mid">
              <span className="scard-big">{sc.total}<small>/ 1600</small></span>
              {trend.length > 1 ? <Sparkline values={trend} target={goal?.target ?? null} /> : null}
            </div>
            {goalRow}
          </>
        ) : (
          <div className="scard-lock">
            <span className="scard-lock-ico"><Icon name="lock" size={18} strokeWidth={2} /></span>
            <div>
              <h2 className="scard-lock-t">Unlock your score estimate</h2>
              <p className="scard-lock-sub">Answer {UNLOCK_AFTER} questions in each section.</p>
              {goalRow}
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
            <div className="st-top">
              <span className="stat-l">Streak</span>
              {st.current ? (
                <button type="button" className="btn quiet sm icon st-share" disabled={card.busy}
                        aria-label="Share your streak" title="Share your streak"
                        onClick={() => card.share({
                          value: fmt(st.current), unit: noun(st.current, 'day'), line: 'SAT practice streak',
                          text: `${plural(st.current, 'day')} of SAT practice in a row on LightBluePrep, free SAT practice.`,
                          name: 'lightblueprep-streak',
                        })}>
                  <Icon name="share" size={16} />
                </button>
              ) : null}
            </div>
            <span className="stat-n">
              {goal?.daily
                ? <DailyRing done={st.today} goal={goal.daily} />
                : <Icon name="flame" size={20} strokeWidth={2.2} />}
              {fmt(st.current)}<small>{noun(st.current, 'day')}</small>
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
                      {today ? `Today, ${day}` : day}: {on ? 'practiced' : today ? 'not yet' : 'missed'}
                    </span>
                  </li>
                )
              })}
            </ul>
            {st.atRisk ? (
              <span className="stat-sub streak-risk">Keep your {st.current}-day streak: answer 1 today</span>
            ) : null}
            {/* Offered while a habit is still forming; past day 1 it is in Settings. */}
            {st.current <= 1 ? (
              <button type="button" className="link st-remind" onClick={() => setDialog('remind')}>
                <Icon name="bell" size={14} strokeWidth={2} />
                Remind me daily
              </button>
            ) : null}
          </div>
          <Stat label="Covered" value={fmt(covered)} sub={`of ${fmt(total)}`}
                meter={total ? covered / total : 0} />
          <Stat label="Accuracy" value={acc ? acc.pct : <NoData />} unit={acc ? '%' : undefined}
                sub={acc ? undefined : 'After 5 answers'} />
        </div>
      </section>
      {/* The method is written out, not left in a tooltip touch never shows. */}
      <p className="scard-note">
        {sc.total !== null ? 'From your first try at each question, weighted by difficulty. ' : ''}
        Practice estimate, not an official score.
      </p>
      {/* Out of the hero, whose z-index makes a stacking context that would put
          the dialog under the nav and the phone's start and tab bars. Into
          .shell rather than body, so the shell's control styles still apply. */}
      {dialog ? createPortal(
        dialog === 'goal'
          ? <GoalDialog goal={goal} onClose={() => setDialog(null)} />
          : <ReminderDialog goal={goal} onClose={() => setDialog(null)} />,
        document.querySelector('.shell') ?? document.body,
      ) : null}
    </div>
  )
}
