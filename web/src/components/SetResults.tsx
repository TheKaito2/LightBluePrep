/**
 * The score screen a set lands on when it ends.
 *
 * Everything here comes from the set's own snapshot rather than from the
 * attempts table, so a set you finished last week still shows what you scored
 * last week even if you have answered those questions again since.
 */
import { useEffect, useState, type ReactNode } from 'react'
import * as api from '../api'
import { Icon } from './Icon'
import { Mascot } from './Mascot'
import { PageHead } from './PageHead'
import { ConfirmDelete } from './ConfirmDelete'
import { QuestionDetail } from './QuestionDetail'
import { duration } from '../lib/pacing'
import { DIFFICULTY_NAME, VERDICT, describeSet, fmt, plural, setSection } from '../lib/labels'
import { dayKey, setGains, streak, type HistoryRow } from '../lib/progress'
import type { PracticeSet, SetAnswer, SetItem } from '../types'

interface Props {
  set: PracticeSet
  /** Every attempt, for the streak and estimate chips. */
  history: HistoryRow[]
  /** Put one of its questions back on screen to answer again. */
  onPractice: (id: string) => void
  onPracticeMany: (ids: string[], title: string) => void
  onRedo: (set: PracticeSet) => void
  /** Resolves true once the set is gone. */
  onDelete: (id: string) => Promise<boolean>
  onDone: () => void
}

type Load = 'loading' | 'ok' | 'failed'

export function SetResults({ set, history, onPractice, onPracticeMany, onRedo, onDelete, onDone }: Props) {
  const items = set.items ?? []
  const missed = items.filter((i) => !i.correct)
  const [meta, setMeta] = useState<Map<string, SetItem>>(new Map())
  const [load, setLoad] = useState<Load>('loading')
  /**
   * Which row is expanded. Opening one reads the question back rather than
   * reopening it to answer: the set is already scored, so the useful thing here
   * is the explanation and what you did, not another go at it. The first miss
   * starts open, since reading it is the reason to be here.
   */
  const [open, setOpen] = useState<string | null>(missed[0]?.question_id ?? null)
  const [showAll, setShowAll] = useState(false)

  // The snapshot stores ids and outcomes, not skill names. Those come from the
  // bank so the list can say what each question was about.
  useEffect(() => {
    let stale = false
    api.questionSet({})
      .then((d) => {
        if (stale) return
        setMeta(new Map(d.questions.map((q) => [q.id, q])))
        setLoad('ok')
      })
      .catch(() => { if (!stale) setLoad('failed') })
    return () => { stale = true }
  }, [])

  const total = items.length
  const pct = total ? Math.round((set.correct / total) * 100) : 0
  const mood = pct >= 70 ? 'cheer' : pct >= 40 ? 'neutral' : 'oops'
  const section = setSection(set.filters)
  const topic = describeSet(set, false)
  const finished = set.finished_at ?? Math.floor(Date.now() / 1000)
  const span = { from: set.created_at, to: finished }
  // Older sets split the clock evenly across their questions; a column of
  // identical times says nothing true, so it goes.
  const timed = total > 1 && items.some((i) => i.seconds !== items[0].seconds)

  const gains = setGains(history, items.map((i) => i.question_id), set.created_at, finished)
  // The streak is today's; it only belongs on a set finished today.
  const days = dayKey(new Date(finished * 1000)) === dayKey(new Date()) ? streak(history).current : 0
  const delta = gains.before !== null && gains.after !== null ? gains.after - gains.before : 0

  const order = items.map((item, i) => ({ item, n: i + 1 }))
  const rows = [...order.filter((r) => !r.item.correct), ...(showAll ? order.filter((r) => r.item.correct) : [])]

  const chips = [
    days ? <span key="s" className="chip static"><Icon name="flame" size={14} />Streak: {plural(days, 'day')}</span> : null,
    delta ? (
      <span key="e" className="chip static">
        <Icon name={delta > 0 ? 'trend-up' : 'trend-down'} size={14} />
        Estimate {gains.after} ({delta > 0 ? '+' : '−'}{Math.abs(delta)})
      </span>
    ) : null,
    gains.fresh ? <span key="b" className="chip static"><Icon name="layers" size={14} />Bank progress +{fmt(gains.fresh)}</span> : null,
  ].filter(Boolean)

  return (
    <div className="setres">
      <PageHead tone="section" section={section}
                eyebrow={`Set complete · ${topic}`}
                back={(
                  <button className="btn sm quiet setres-back" onClick={onDone}>
                    <Icon name="chevron-left" size={16} strokeWidth={2.2} />
                    Back to Review
                  </button>
                )}
                media={<Mascot mood={mood} size={72} className={mood === 'cheer' ? 'setres-bulb rise' : 'setres-bulb'} />}
                title={(
                  <span className="setres-score">
                    {fmt(set.correct)}<small> / {fmt(total)}</small>
                  </span>
                )}
                sub={[
                  missed.length ? `${pct}% correct` : 'Perfect set: every answer correct',
                  set.seconds ? duration(set.seconds) : '',
                  set.answered < total ? `${fmt(total - set.answered)} ${VERDICT.unanswered.toLowerCase()}` : '',
                ].filter(Boolean).join(' · ')}
                foot={chips.length ? <div className="chips">{chips}</div> : null}>
        <div className="setres-acts">
          {missed.length ? (
            <>
              <button className="btn on-colour"
                      onClick={() => onPracticeMany(missed.map((i) => i.question_id), `Missed: ${describeSet(set)}`)}>
                {missed.length === 1 ? 'Retry the one you missed' : `Retry the ${fmt(missed.length)} you missed`}
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
              <button className="btn on-ink-secondary" onClick={() => onRedo(set)}>
                Do the whole set again
              </button>
            </>
          ) : (
            <button className="btn on-colour" onClick={() => onRedo(set)}>Do this set again</button>
          )}
          <ConfirmDelete label="Delete set" confirmText="Delete this set" cancelText="Cancel"
                         onConfirm={() => onDelete(set.id)} />
        </div>
      </PageHead>

      <div className={section ? `review setres-body sec-${section}` : 'review setres-body'}>
        <h2 className="setres-h">
          {missed.length ? `${fmt(missed.length)} missed` : `All ${fmt(total)} correct`}
        </h2>
        {load === 'failed' ? <p className="setres-note">Couldn't load question names.</p> : null}

        {rows.length ? (
          <ul className="review-list setres-list">
            {rows.map(({ item, n }) => (
              <Row key={item.question_id} item={item} n={n} q={meta.get(item.question_id)} load={load}
                   timed={timed} open={open === item.question_id}
                   onToggle={() => setOpen(open === item.question_id ? null : item.question_id)}>
                <QuestionDetail id={item.question_id}
                                response={item.response}
                                seconds={item.seconds}
                                onPractice={onPractice}
                                onPracticeMany={onPracticeMany}
                                setWindow={span}
                                editable={!item.correct} />
              </Row>
            ))}
          </ul>
        ) : null}

        {missed.length < total ? (
          <button className="btn quiet sm setres-all" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? (missed.length ? 'Show missed only' : 'Hide questions') : `Show all ${fmt(total)}`}
            <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Row({ item, n, q, load, timed, open, onToggle, children }: {
  item: SetAnswer
  n: number
  q: SetItem | undefined
  load: Load
  timed: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  // Same badge classes and words as the Review page. Unanswered is neutral:
  // amber there means right on a retry.
  const [mark, label, icon] = item.response === null ? ['neutral', VERDICT.unanswered, null]
    : item.correct ? ['ok', VERDICT.correct, 'check' as const] : ['bad', VERDICT.incorrect, 'close' as const]
  return (
    <li className={open ? 'review-item open' : 'review-item'}>
      <button className="review-row" aria-expanded={open} onClick={onToggle}>
        <span className="q-num">{n}</span>
        <span className={`review-badge badge ${mark}`}>
          {icon ? <Icon name={icon} size={12} strokeWidth={2.6} /> : null}
          <span className="badge-t">{label}</span>
        </span>
        <span className="review-main">
          {q ? (
            <>
              <span className="review-skill">{q.skill_name}</span>
              <span className="review-meta">{q.domain_name} · {DIFFICULTY_NAME[q.difficulty] ?? q.difficulty}</span>
            </>
          ) : load === 'loading' ? (
            <>
              <span className="skel setres-skel-t" />
              <span className="skel setres-skel-m" />
            </>
          ) : (
            <span className="review-skill">
              {load === 'ok' ? 'Question no longer in the bank' : `Question ${n}`}
            </span>
          )}
        </span>
        {timed ? (
          <span className="review-nums">
            <span className="review-time">{item.seconds ? duration(item.seconds) : '—'}</span>
          </span>
        ) : null}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2.2} />
      </button>
      {open ? children : null}
    </li>
  )
}
