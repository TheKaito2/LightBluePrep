/**
 * The weakness finder page: build the finder sets, carry on with them, and
 * read back where the points go, with a plan up to the test. The logic lives
 * in lib/finder.ts; this page fetches, saves and draws.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { ConfirmDelete } from './ConfirmDelete'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { PageHead } from './PageHead'
import { ResumeLabel, SetCard } from './SetCard'
import { Stat, StatGroup } from './Stat'
import {
  analyzeFinder, buildFinder, finderPlan, isFinderSet, MIN_RESULTS, PACE,
  type FinderAnswer, type FinderDraft, type FinderGroup, type WeakType,
} from '../lib/finder'
import { useGoal } from '../lib/goal'
import { fmt, SECTION_NAME } from '../lib/labels'
import { newSet, setAttemptId } from '../lib/sets'
import { loadProcessTypes, type ProcessTypes } from '../lib/similar'
import type { Filters, PracticeSet } from '../types'

const SUB = 'One question of every type at every difficulty, untimed. Your answers show which types cost you points, and how your time compares with the real test.'

interface Props {
  dataVersion: number
  onResume: (id: string) => void
  onPractice: (filters: Filters) => void
  fail: (e: unknown, retry?: () => void) => void
}

interface Loaded { sets: PracticeSet[]; answers: FinderAnswer[]; done: Map<string, number>; drafts: FinderDraft[]; pt: ProcessTypes | null }

/** Reading and Writing first, then by title, which keeps a domain's parts in order. */
const bySetOrder = (a: PracticeSet, b: PracticeSet) =>
  (a.filters.section === 'RW' ? 0 : 1) - (b.filters.section === 'RW' ? 0 : 1)
  || (a.filters.title ?? '').localeCompare(b.filters.title ?? '', 'en', { numeric: true })

async function load(): Promise<Loaded> {
  const [all, pt, byId] = await Promise.all([api.listSets(undefined, 1000), loadProcessTypes(), api.questionsById()])
  const sets = all.filter(isFinderSet).sort(bySetOrder)
  const answers: FinderAnswer[] = []
  const done = new Map<string, number>()
  for (const s of sets) {
    const full = await api.getSet(s.id)
    for (const item of full.items ?? []) {
      const q = byId.get(item.question_id)
      if (!q) continue
      // An untimed set records each answer as its own attempt, under this id.
      const own = setAttemptId(s.id, item.question_id)
      const attempt = (await api.attemptsFor(item.question_id)).attempts.find((a) => a.id === own)
      if (!attempt) continue
      answers.push({ q, correct: attempt.correct === 1, seconds: attempt.seconds })
      done.set(s.id, (done.get(s.id) ?? 0) + 1)
    }
  }
  let drafts: FinderDraft[] = []
  if (!sets.length && pt) {
    const pool = await api.questionSet({ excludeLive: true })
    drafts = buildFinder(pool.questions, pt)
  }
  return { sets, answers, done, drafts, pt }
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const pace = (x: number) => `${x.toFixed(1)}×`
const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function GroupTable({ title, id, rows }: { title: string; id: string; rows: FinderGroup[] }) {
  return (
    <section className="block" aria-labelledby={id}>
      <div className="block-head"><h2 className="h1-section" id={id}>{title}</h2></div>
      <div className="ftable-wrap">
        <table className="ftable">
          <thead>
            <tr><th scope="col">Section</th><th scope="col">Name</th><th scope="col">Answered</th>
              <th scope="col">Accuracy</th><th scope="col">Time vs pace</th><th scope="col">Points lost per question</th></tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={`${g.section}|${g.name}`} className={`sec-${g.section}`}>
                <td><span className="ftable-dot" aria-hidden="true" />{SECTION_NAME[g.section]}</td>
                <td className="ftable-name">{g.name}</td>
                <td>{fmt(g.n)}</td>
                <td>{pct(g.accuracy)}</td>
                <td className={g.pace > 1.5 ? 'is-slow' : undefined}>{pace(g.pace)}{g.pace > 1.5 ? ' slow' : ''}</td>
                <td>{g.lostPerQ.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WeakRow({ w, onPractice }: { w: WeakType; onPractice: Props['onPractice'] }) {
  const why = [
    w.hardMiss ? `${w.hardMiss} hard missed` : '',
    w.careless ? `${w.careless} easier missed` : '',
    w.slow ? `${w.slow} slow` : '',
  ].filter(Boolean)
  return (
    <li className={`fweak sec-${w.section}`}>
      <div className="fweak-id">
        <span className="fweak-name">{w.label}</span>
        <span className="fweak-skill">{w.skillName}</span>
        {w.how ? <span className="fweak-how">{w.how}</span> : null}
      </div>
      <div className="fweak-figs">
        <span>{pct(w.accuracy)} right</span>
        <span className={w.pace > 1.5 ? 'is-slow' : undefined}>{pace(w.pace)} pace{w.pace > 1.5 ? ', slow' : ''}</span>
        {why.map((t) => <span key={t} className="fweak-tag">{t}</span>)}
      </div>
      <button type="button" className="btn sm fweak-go" aria-label={`Practice ${w.label}`}
              onClick={() => onPractice({
                section: w.section, skills: [w.skill], types: [w.ref], difficulties: ['M', 'H'], excludeLive: true,
              })}>
        Practice
        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
      </button>
    </li>
  )
}

export function Finder({ dataVersion, onResume, onPractice, fail }: Props) {
  const [data, setData] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const goal = useGoal()

  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  // The effect owns each load, so an older one that finishes late, or one
  // that finishes after leaving the page, changes nothing.
  useEffect(() => {
    let live = true
    load().then((d) => { if (live) setData(d) }).catch((e: unknown) => { if (live) fail(e, reload) })
    return () => { live = false }
  }, [dataVersion, nonce, fail, reload])

  const report = useMemo(() => (data?.pt && data.answers.length ? analyzeFinder(data.answers, data.pt) : null), [data])
  const plan = useMemo(() => (report ? finderPlan(report.weak, goal?.date ?? null) : null), [report, goal?.date])

  /** True once every set is saved. Reloads either way, so the page shows what was saved. */
  async function build(drafts: FinderDraft[]): Promise<boolean> {
    setBusy(true)
    try {
      for (const d of drafts) await api.saveSet(newSet(d.filters, d.ids))
      return true
    } catch (e) { fail(e); return false } finally { setBusy(false); reload() }
  }

  async function startOver(): Promise<boolean> {
    if (!data?.pt) return false
    try {
      for (const s of data.sets) await api.deleteSet(s.id)
      const pool = await api.questionSet({ excludeLive: true })
      return await build(buildFinder(pool.questions, data.pt))
    } catch (e) { fail(e); reload(); return false }
  }

  if (!data) {
    return (
      <>
        <PageHead tone="ink" title="Weakness finder" sub={SUB} />
        <div className="stats" aria-busy="true"><span className="sr-only" role="status">Loading the finder</span></div>
      </>
    )
  }

  const total = data.sets.reduce((n, s) => n + s.total, 0)
  const answered = data.answers.length

  if (!data.sets.length) {
    const n = data.drafts.reduce((k, d) => k + d.ids.length, 0)
    return (
      <>
        <PageHead tone="ink" title="Weakness finder" sub={SUB} />
        <div className="stats">
          <EmptyState heading="h2" title="Find the question types that cost you points"
                      body={n
                        ? `${fmt(n)} questions in ${fmt(data.drafts.length)} sets, one set per domain. No questions from the official practice tests, so those stay fresh. Take one set per sitting and stay on the page while you work: time counts.`
                        : 'The question types could not be loaded. Check your connection and reload.'}
                      action={n && !busy ? { label: 'Build my finder', onClick: () => { void build(data.drafts) } } : undefined} />
        </div>
      </>
    )
  }

  const correct = data.answers.filter((a) => a.correct).length
  return (
    <>
      <PageHead tone="ink" title="Weakness finder" sub={SUB}>
        <StatGroup className="stats-strip">
          <Stat size="l" label="Answered" value={fmt(answered)} sub={`of ${fmt(total)}`} meter={answered / Math.max(total, 1)} />
          <Stat size="l" label="Accuracy" value={answered ? Math.round((correct / answered) * 100) : '–'} unit={answered ? '%' : undefined} />
          <Stat size="l" label="Pace" value={`${PACE.RW}s / ${PACE.MATH}s`} sub="R&W / Math target" />
        </StatGroup>
      </PageHead>
      <div className="stats finder">
        <section className="block" aria-labelledby="fsets-t">
          <div className="block-head">
            <h2 className="h1-section" id="fsets-t">Your finder sets</h2>
            <ConfirmDelete className="fsets-over" label="Start the finder over" confirmText="Delete all and rebuild?"
                           cancelText="Keep" onConfirm={startOver} />
          </div>
          <ul className="setlist">
            {data.sets.map((s) => (
              <SetCard key={s.id} set={s} onOpen={() => onResume(s.id)}
                       onDelete={async () => {
                         try { await api.deleteSet(s.id); reload(); return true } catch (e) { fail(e); return false }
                       }}
                       meta={`${fmt(data.done.get(s.id) ?? 0)} of ${fmt(s.total)} answered`}
                       progress={(data.done.get(s.id) ?? 0) / Math.max(s.total, 1)}
                       aside={s.finished_at ? undefined : <ResumeLabel />} />
            ))}
          </ul>
        </section>

        {!data.pt ? (
          <EmptyState mood="oops" title="Results need the question types"
                      body="They could not be loaded. Check your connection and reload the page." />
        ) : answered < MIN_RESULTS || !report || !plan ? (
          <EmptyState title="Results come after 20 answers"
                      body={`${fmt(answered)} so far. Each set mixes types and difficulties, so any set counts.`} />
        ) : (
          <>
            <section className="block" aria-labelledby="fweak-t">
              <div className="block-head"><h2 className="h1-section" id="fweak-t">Where you lose points</h2></div>
              <p className="finder-note">Misses count 1 on easy, 2 on medium and 3 on hard. A right answer slower than 1.5× the pace counts half.</p>
              {report.weak.length
                ? <ul className="fweak-list">{report.weak.slice(0, 12).map((w) => <WeakRow key={w.ref} w={w} onPractice={onPractice} />)}</ul>
                : <EmptyState mood="cheer" title="Nothing lost yet" body="Every answer so far was right and on pace." />}
            </section>

            <section className="block" aria-labelledby="fplan-t">
              <div className="block-head"><h2 className="h1-section" id="fplan-t">Your plan</h2></div>
              <p className="finder-note">
                {plan.fitted ? 'Up to the day before your test.' : 'Fourteen days. Set a coming test date on the Plan page to fit it to your test.'}
                {' '}For each type, read the method, then do 10 to 15 questions of it.
              </p>
              <ol className="fplan">
                {plan.days.map((d) => (
                  <li key={d.date} className="fplan-day">
                    <h3 className="fplan-date">{dayLabel(d.date)}</h3>
                    {d.kind === 'light' ? <p className="fplan-text">Light day. Reread your misses, no new questions.</p>
                      : d.kind === 'redo' ? <p className="fplan-text">Redo every question you missed, without looking at your old answer.</p>
                      : d.types.length ? (
                        <ul className="fweak-list">{d.types.map((w) => <WeakRow key={w.ref} w={w} onPractice={onPractice} />)}</ul>
                      ) : <p className="fplan-text">Mixed practice: one timed set per section.</p>}
                  </li>
                ))}
              </ol>
              {plan.extra.length ? (
                <p className="finder-note">If you have time: {plan.extra.map((w) => w.label).join('; ')}.</p>
              ) : null}
            </section>

            <GroupTable id="fdom-t" title="By domain" rows={report.byDomain} />
            <GroupTable id="fdiff-t" title="By difficulty" rows={report.byDifficulty} />
            <GroupTable id="fskill-t" title="By skill" rows={report.bySkill} />
          </>
        )}
      </div>
    </>
  )
}
