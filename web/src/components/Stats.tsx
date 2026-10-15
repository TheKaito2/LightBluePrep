import { useMemo } from 'react'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { PageHead } from './PageHead'
import { NoData, Stat, StatGroup } from './Stat'
import { DIFFICULTIES, DIFFICULTY_NAME, SECTIONS, SECTION_NAME, SECTION_SHORT, fmt } from '../lib/labels'
import { MIN_ANSWERS, graded } from '../lib/score'
import { focusSkills, rollup, type SkillTally, type Tally } from '../lib/taxonomy'
import type { Filters, TaxonomyRow } from '../types'

interface Props {
  taxonomy: TaxonomyRow[]
  onPractice: (filters: Filters) => void
  /** Start a 10-question set from the whole bank. */
  onStart: () => void
}

/**
 * Answers a section needs before the page has anything worth drawing. Below
 * this on both sections every block would be a row of dashes, so the page
 * shows how close you are instead.
 */
const UNLOCK = 10

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

const SUB = "Where you stand, where you're losing points, and what to drill next."

/**
 * Accuracy, graded only once there are enough answers to judge: one unlucky
 * question should not paint a skill red. Text colours, so all three clear
 * 4.5:1 on white.
 */
function Accuracy({ t }: { t: Tally }) {
  if (!t.seen) return <span className="acc none"><NoData /></span>
  const g = graded(t.seen, t.correct)
  if (!g) {
    return <span className="acc none" title="Too few answers to judge">{fmt(t.correct)} of {fmt(t.seen)}</span>
  }
  return (
    <span className={`acc ${g.grade}`} title={`${fmt(t.correct)} of ${fmt(t.seen)} correct`}>
      {g.pct}%
    </span>
  )
}

/** Accuracy as a bar, drawn from MIN_ANSWERS answers; an empty track before that. */
function AccMeter({ t, className }: { t: Tally; className: string }) {
  const g = graded(t.seen, t.correct)
  return (
    <span className={`meter ${className}`} aria-hidden="true">
      {g && t.correct ? <span className="meter-fill" style={{ width: `${g.pct}%` }} /> : null}
    </span>
  )
}

/**
 * A row label with its practice arrow. The arrow is glued to the last word so
 * a wrapped name never leaves it alone on a line.
 */
function ArrowLabel({ name }: { name: string }) {
  const cut = name.lastIndexOf(' ') + 1
  return (
    <span className="row-label">
      {name.slice(0, cut)}
      <span className="row-last">{name.slice(cut)}<Icon name="arrow-right" size={14} strokeWidth={2.2} /></span>
    </span>
  )
}

/** A strip cell for one section's accuracy. */
function SectionStat({ label, short, t }: { label: string; short: string; t: Tally }) {
  const g = graded(t.seen, t.correct)
  return (
    <Stat size="l" label={<><span className="long">{label}</span><span className="short">{short}</span></>}
          value={g ? g.pct : <NoData />} unit={g ? '%' : undefined}
          sub={g ? `${fmt(t.correct)} of ${fmt(t.seen)}` : t.seen ? `${fmt(t.seen)} answered` : 'None yet'} />
  )
}

function FocusRow({ k, onPractice }: { k: SkillTally; onPractice: (f: Filters) => void }) {
  const g = graded(k.seen, k.correct)
  // What the button serves: the questions not answered yet or last answered
  // wrong. Taxonomy `correct` counts questions whose last answer was right.
  const pool = k.n - k.correct
  const go = () => onPractice({
    section: k.section, domains: [k.domain], skills: [k.code], statuses: ['unseen', 'wrong'],
  })
  return (
    <li className={`focus-row sec-${k.section}`}>
      <span className="focus-dot" aria-hidden="true" />
      <div className="focus-id">
        <span className="focus-name">{k.name}</span>
        <span className="focus-meta">
          <span className="focus-where">{k.domainName}</span>
          <span className="focus-count">{fmt(k.correct)} of {fmt(k.seen)} correct</span>
        </span>
      </div>
      <AccMeter t={k} className="focus-meter" />
      {g ? <span className={`focus-acc grade-${g.grade}`}>{g.pct}%</span> : null}
      <button type="button" className="btn sm focus-go" onClick={go}
              title={`${fmt(pool)} not answered yet or answered incorrectly`}
              aria-label={`Practice ${fmt(pool)} not answered or incorrect in ${k.name}`}>
        Practice {fmt(pool)}
        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
      </button>
      <button type="button" className="btn icon focus-go-icon" onClick={go} aria-label={`Practice ${k.name}`}>
        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
      </button>
    </li>
  )
}

/** Before the bank index arrives: the band, the shape of the strip and three rows. */
function Loading() {
  return (
    <>
      <PageHead tone="ink" title="Stats" sub={SUB}>
        <div className="stat-group stats-skel-strip" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat">
              <span className="skel stats-skel-l" />
              <span className="skel stats-skel-n" />
            </div>
          ))}
        </div>
      </PageHead>
      <div className="stats" aria-busy="true">
        <span className="sr-only" role="status">Loading your stats</span>
        <ul className="focus" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="focus-row stats-skel-row">
              <span className="skel stats-skel-name" />
              <span className="skel stats-skel-meta" />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export function Stats({ taxonomy, onPractice, onStart }: Props) {
  const model = useMemo(() => {
    const r = rollup(taxonomy)
    const untouched = r.skills
      .filter((k) => k.seen === 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
    return { ...r, focus: focusSkills(r.skills), untouched }
  }, [taxonomy])

  if (!taxonomy.length) return <Loading />

  const { total, sections, domains, difficulty, focus, untouched } = model

  if (SECTIONS.every((s) => sections[s].seen < UNLOCK)) {
    return (
      <>
        <PageHead tone="ink" title="Stats" sub={SUB} />
        <div className="stats">
          <EmptyState className="stats-locked" heading="h2" title={`Stats unlock at ${UNLOCK} answers per section`}
                      body="Answer a few questions in each section and this page shows where you're losing points."
                      action={{ label: `Start a ${UNLOCK}-question set`, onClick: onStart }}>
            <ul className="unlock">
              {SECTIONS.map((s) => {
                const n = Math.min(sections[s].seen, UNLOCK)
                return (
                  <li key={s} className={`unlock-row sec-${s}`}>
                    <span className="unlock-l">{SECTION_NAME[s]}</span>
                    <span className="unlock-n">{n} / {UNLOCK}</span>
                    <span className="meter" aria-hidden="true">
                      {n ? <span className="meter-fill" style={{ width: `${(n / UNLOCK) * 100}%` }} /> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </EmptyState>
        </div>
      </>
    )
  }

  const coverage = pct(total.seen, total.n)

  return (
    <>
    <PageHead tone="ink" title="Stats" sub={SUB}>
      <StatGroup className="stats-strip">
        <Stat size="l" label="Accuracy" value={pct(total.correct, total.seen)} unit="%"
              sub={`${fmt(total.correct)} of ${fmt(total.seen)}`} />
        <Stat size="l" label="Answered" value={fmt(total.seen)}
              sub={`${coverage < 1 ? '<1' : coverage}% of bank`} meter={total.seen / total.n} />
        {SECTIONS.map((s) => (
          <SectionStat key={s} label={SECTION_NAME[s]} short={SECTION_SHORT[s]} t={sections[s]} />
        ))}
      </StatGroup>
    </PageHead>
    <div className="stats">

      <section className="block" aria-labelledby="focus-title">
        <div className="block-head">
          <h2 className="h1-section" id="focus-title">Where to focus</h2>
        </div>
        {focus.length ? (
          <ul className="focus">
            {focus.map((k) => <FocusRow key={`${k.section}|${k.domain}|${k.code}`} k={k} onPractice={onPractice} />)}
          </ul>
        ) : (
          <>
            <EmptyState className="focus-empty" title="No weak spots yet"
                        body={`Answer ${MIN_ANSWERS} or more questions in a skill to rank it.`} />
            {untouched.length ? (
              <>
                <h3 className="focus-new-t">Start with the biggest skills you haven't tried</h3>
                <ul className="focus">
                  {untouched.map((k) => (
                    <li key={`${k.section}|${k.domain}|${k.code}`} className={`focus-row is-new sec-${k.section}`}>
                      <span className="focus-dot" aria-hidden="true" />
                      <div className="focus-id">
                        <span className="focus-name">{k.name}</span>
                        <span className="focus-meta"><span className="focus-where">{k.domainName}</span></span>
                      </div>
                      <span className="focus-new">{fmt(k.n)} new</span>
                      <button type="button" className="btn sm focus-go"
                              aria-label={`Practice ${k.name}`}
                              onClick={() => onPractice({
                                section: k.section, domains: [k.domain], skills: [k.code], statuses: ['unseen'],
                              })}>
                        Practice
                        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="block" aria-labelledby="difficulty-title">
        <div className="block-head">
          <h2 className="h1-section" id="difficulty-title">By difficulty</h2>
        </div>
        <ul className="diffs">
          {DIFFICULTIES.map((f) => {
            const t = difficulty[f]
            const g = graded(t.seen, t.correct)
            return (
              <li key={f} className={`diff d-${f}`}>
                <span className="diff-l">
                  <span className="diff-dot" aria-hidden="true" />
                  <span className="diff-name">{DIFFICULTY_NAME[f]}</span>
                  <span className="diff-meta">
                    {' · '}{t.seen ? `${fmt(t.seen)} answered` : 'Not tried yet'}
                    {g ? <>{' · '}<span className={`grade-${g.grade}`}>{g.pct}%</span></> : null}
                  </span>
                </span>
                {/* Neutral on purpose: the dot already carries the difficulty
                    colour, and green, amber and red here would read as grades. */}
                <span className="meter diff-bar" aria-hidden="true">
                  {g && t.correct ? <span className="meter-fill" style={{ width: `${g.pct}%` }} /> : null}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {SECTIONS.map((section) => {
        const t = sections[section]
        const g = graded(t.seen, t.correct)
        return (
          <section className={`block spanel sec-${section}`} key={section} aria-labelledby={`stats-${section}`}>
            <header className="spanel-h">
              <span className="spanel-ico">
                <Icon name={section === 'RW' ? 'book' : 'sigma'} size={18} strokeWidth={2} />
              </span>
              <div className="spanel-txt">
                <h2 className="spanel-t" id={`stats-${section}`}>{SECTION_NAME[section]}</h2>
                <p className="spanel-sub">{fmt(t.seen)} of {fmt(t.n)} answered</p>
              </div>
              {g ? <span className="spanel-pct">{g.pct}<small>%</small></span> : null}
              <button type="button" className="btn on-colour sm" aria-label={`Practice ${SECTION_NAME[section]}`}
                      onClick={() => onPractice({ section })}>
                Practice
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            </header>
            <ul className="rows">
              {domains.filter((d) => d.section === section).map((d) => (
                <li key={d.code} className="domain-group">
                  <button type="button" className="row-item is-domain"
                          onClick={() => onPractice({ section, domains: [d.code] })}>
                    <span className="row-name">
                      <span className="sr-only">Practice </span>
                      <ArrowLabel name={d.name} />
                    </span>
                    <span className="row-count">{fmt(d.seen)} / {fmt(d.n)} answered</span>
                    <AccMeter t={d} className="row-meter" />
                    <Accuracy t={d} />
                  </button>
                  <ul className="rows sub">
                    {d.skills.map((k) => (
                      <li key={k.code} className="row-item is-skill">
                        <button type="button" className="row-name"
                                onClick={() => onPractice({ section, domains: [d.code], skills: [k.code] })}>
                          <span className="sr-only">Practice </span>
                          <ArrowLabel name={k.name} />
                        </button>
                        <span className="row-count">{fmt(k.seen)} / {fmt(k.n)}</span>
                        <AccMeter t={k} className="row-meter" />
                        <Accuracy t={k} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
    </>
  )
}
