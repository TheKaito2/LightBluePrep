import { Fragment, useMemo } from 'react'
import { Icon } from './Icon'
import { PageHead } from './PageHead'
import { DIFFICULTIES, DIFFICULTY_NAME, SECTIONS, SECTION_NAME, byDomain, bySkill, fmt } from '../lib/labels'
import { MIN_ANSWERS, grade, graded } from '../lib/score'
import type { Filters, Section, TaxonomyRow } from '../types'

interface Props {
  taxonomy: TaxonomyRow[]
  onPractice: (filters: Filters) => void
}


interface Tally { n: number; seen: number; correct: number }
const empty = (): Tally => ({ n: 0, seen: 0, correct: 0 })
const add = (into: Tally, row: TaxonomyRow) => {
  into.n += row.n; into.seen += row.seen; into.correct += row.correct
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/**
 * Accuracy, graded only once there are enough answers to judge: one unlucky
 * question should not paint a skill red. Text colours, so all three clear
 * 4.5:1 on white.
 */
function Accuracy({ t }: { t: Tally }) {
  if (!t.seen) return <span className="acc none" title="Not tried yet">—</span>
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

/** Single-series magnitude bar. No legend: the row label names it. */
function Bar({ value, total, title }: { value: number; total: number; title?: string }) {
  return (
    <span className="bar" title={title}>
      <span className="bar-fill" style={{ width: `${Math.max(Math.min(100, pct(value, total)), value ? 1.5 : 0)}%` }} />
    </span>
  )
}

export function Stats({ taxonomy, onPractice }: Props) {
  const model = useMemo(() => {
    const overall = empty()
    const sections = new Map<Section, Tally>()
    const domains = new Map<string, Tally & { name: string; section: Section; code: string }>()
    const skills = new Map<string, Tally & {
      name: string; code: string; domain: string; domainName: string; section: Section
    }>()
    const difficulty = new Map<string, Tally>()

    for (const row of taxonomy) {
      add(overall, row)

      const s = sections.get(row.section) ?? empty()
      add(s, row); sections.set(row.section, s)

      const dKey = row.section + '|' + row.domain
      const d = domains.get(dKey)
        ?? { ...empty(), name: row.domain_name, section: row.section, code: row.domain }
      add(d, row); domains.set(dKey, d)

      const kKey = dKey + '|' + row.skill
      const k = skills.get(kKey) ?? {
        ...empty(), name: row.skill_name, code: row.skill,
        domain: row.domain, domainName: row.domain_name, section: row.section,
      }
      add(k, row); skills.set(kKey, k)

      const f = difficulty.get(row.difficulty) ?? empty()
      add(f, row); difficulty.set(row.difficulty, f)

    }

    const domainList = [...domains.values()].sort(
      (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || byDomain(a, b))
    const skillList = [...skills.values()].sort(bySkill)

    // Ranked only from enough answers that a weak spot is real.
    const focus = skillList
      .filter((k) => k.seen >= MIN_ANSWERS)
      .sort((a, b) => pct(a.correct, a.seen) - pct(b.correct, b.seen))
      .slice(0, 5)

    const untouched = skillList
      .filter((k) => k.seen === 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)

    const biggestDomain = Math.max(1, ...domainList.map((d) => d.n))

    return {
      overall, sections, domainList, skillList, difficulty, focus, untouched,
      biggestDomain,
    }
  }, [taxonomy])

  const {
    overall, sections, domainList, skillList, difficulty,
    focus, untouched, biggestDomain,
  } = model

  const skillsFor = (section: Section, domain: string) =>
    skillList.filter((k) => k.section === section && k.domain === domain)


  const accuracy = overall.seen ? pct(overall.correct, overall.seen) : null
  // The headline keeps its number from the first answer, but stays uncoloured
  // until there are enough answers for the colour to mean something.
  const accuracyClass = accuracy === null ? 'none' : graded(overall.seen, overall.correct) ? grade(accuracy) : ''
  const coverage = pct(overall.seen, overall.n)

  return (
    <>
    <PageHead tone="mint" eyebrow="Your progress" title="Stats"
              sub="Where you stand, where you are losing points, and what to drill next.">
      {/* Single headlines are stat tiles, not charts. */}
      <section className="hero-stats">
        <div className="tile tile-lead">
          <span className="tile-l">Accuracy</span>
          <span className={`tile-n ${accuracyClass}`}>
            {accuracy === null ? '—' : `${accuracy}%`}
          </span>
          <span className="tile-sub">
            {fmt(overall.correct)} of {fmt(overall.seen)} correct
          </span>
        </div>
        <div className="tile">
          <span className="tile-l">Answered</span>
          <span className="tile-n">{fmt(overall.seen)}</span>
          <span className="tile-sub">
            {overall.seen && coverage < 1 ? '<1' : coverage}% of the bank
          </span>
        </div>
        <div className="tile">
          <span className="tile-l">Not tried yet</span>
          <span className="tile-n">{fmt(overall.n - overall.seen)}</span>
          <span className="tile-sub">of {fmt(overall.n)} total</span>
        </div>
        <div className="tile tile-wide">
          <span className="tile-l">Bank progress</span>
          <span className="meter big">
            <span className="meter-fill" style={{ width: `${Math.max(coverage, 0.4)}%` }} />
          </span>
          <span className="tile-sub">
            {fmt(overall.seen)} of {fmt(overall.n)} questions
          </span>
        </div>
      </section>
    </PageHead>
    <div className="stats">

      <section className="block">
        <div className="block-head">
          <h2 className="h">Where to focus</h2>
        </div>
        {focus.length ? (
          <ul className="focus">
            {focus.map((k) => (
              <li key={k.section + k.domain + k.code} className={`focus-row sec-${k.section}`}>
                <div className="focus-id">
                  <span className="focus-name">{k.name}</span>
                  <span className="focus-where">{k.domainName}</span>
                </div>
                <Bar value={k.correct} total={k.seen}
                     title={`${fmt(k.correct)} of ${fmt(k.seen)} correct`} />
                <Accuracy t={k} />
                <button className="btn small"
                        onClick={() => onPractice({ section: k.section, domains: [k.domain], skills: [k.code] })}>
                  Practice
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="hint">
              Nothing has {MIN_ANSWERS} answers yet, so there is no reliable weak
              spot to point at. These are the biggest areas you have not touched.
            </p>
            <ul className="focus">
              {untouched.map((k) => (
                <li key={k.section + k.domain + k.code} className={`focus-row sec-${k.section}`}>
                  <div className="focus-id">
                    <span className="focus-name">{k.name}</span>
                    <span className="focus-where">{k.domainName}</span>
                  </div>
                  <Bar value={0} total={k.n} title={`${fmt(k.n)} not tried yet`} />
                  <span className="acc none">{fmt(k.n)}</span>
                  <button className="btn small"
                          onClick={() => onPractice({ section: k.section, domains: [k.domain], skills: [k.code] })}>
                    Practice
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Magnitude across categories -> horizontal bars, one series, so the row
          label carries identity and no legend is needed. */}
      <section className="block">
        <div className="block-head">
          <h2 className="h">Questions by domain</h2>
        </div>
        <ul className="dbars">
          {domainList.map((d, i) => (
            <Fragment key={d.section + d.code}>
              {i === 0 || domainList[i - 1].section !== d.section ? (
                <li className={`dbar-group sec-${d.section}`}>{SECTION_NAME[d.section]}</li>
              ) : null}
            <li className={`dbar sec-${d.section}`}>
              <span className="dbar-name" title={d.name}>{d.name}</span>
              <span className="dbar-track" title={`${fmt(d.seen)} of ${fmt(d.n)} answered`}>
                <span className="dbar-total" style={{ width: `${(d.n / biggestDomain) * 100}%` }}>
                  <span className="dbar-seen"
                        style={{ width: `${Math.max(pct(d.seen, d.n), d.seen ? 1.5 : 0)}%` }} />
                </span>
              </span>
              <span className="dbar-n">{fmt(d.n)}</span>
              <Accuracy t={d} />
            </li>
            </Fragment>
          ))}
        </ul>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 className="h">By difficulty</h2>
        </div>
        <ul className="dbars">
          {DIFFICULTIES.map((f) => {
            const t = difficulty.get(f) ?? empty()
            return (
              <li key={f} className={`dbar d-${f}`}>
                <span className="dbar-name">{DIFFICULTY_NAME[f]}</span>
                <span className="dbar-track" title={`${fmt(t.seen)} of ${fmt(t.n)} answered`}>
                  <span className="dbar-total" style={{ width: '100%' }}>
                    <span className="dbar-seen"
                          style={{ width: `${Math.max(pct(t.seen, t.n), t.seen ? 1.5 : 0)}%` }} />
                  </span>
                </span>
                <span className="dbar-n">{fmt(t.n)}</span>
                <Accuracy t={t} />
              </li>
            )
          })}
        </ul>
      </section>

      {SECTIONS.map((section) => {
        const t = sections.get(section) ?? empty()
        return (
          <section className={`block spanel sec-${section}`} key={section}>
            <header className="spanel-h">
              <span className="spanel-ico">
                <Icon name={section === 'RW' ? 'book' : 'sigma'} size={24} strokeWidth={2} />
              </span>
              <div className="spanel-txt">
                <h2 className="spanel-t">{SECTION_NAME[section]}</h2>
                <p className="spanel-sub">
                  {fmt(t.seen)} of {fmt(t.n)} answered
                </p>
              </div>
              <Accuracy t={t} />
            </header>
            <ul className="rows">
              {domainList.filter((d) => d.section === section).map((d) => (
                <li key={d.code} className="domain-group">
                  <div className="row-item is-domain">
                    <span className="row-name">{d.name}</span>
                    <span className="row-count">{fmt(d.seen)}<span className="dim"> / {fmt(d.n)}</span></span>
                    <Bar value={d.seen} total={d.n} title={`${fmt(d.seen)} of ${fmt(d.n)} answered`} />
                    <Accuracy t={d} />
                  </div>
                  <ul className="rows sub">
                    {skillsFor(section, d.code).map((k) => (
                      <li key={k.code} className="row-item is-skill">
                        <button className="row-name link"
                                onClick={() => onPractice({ section, domains: [d.code], skills: [k.code] })}
                                title={`Practice ${k.name}`}>
                          {k.name}
                          <Icon name="arrow-right" size={13} strokeWidth={2.2} />
                        </button>
                        <span className="row-count">{fmt(k.seen)}<span className="dim"> / {fmt(k.n)}</span></span>
                        <Bar value={k.seen} total={k.n} title={`${fmt(k.seen)} of ${fmt(k.n)} answered`} />
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
