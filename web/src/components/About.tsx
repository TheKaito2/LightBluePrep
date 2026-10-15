/**
 * About, privacy, credits.
 *
 * The privacy part must stay true to what the build actually does: what is
 * collected, what is not, how to delete it. Keep it in step with
 * public/privacy.html.
 *
 * One reading column of sections (spec 8.6), Privacy second so it is on the
 * first screen, and the two actions gathered in one card at the end.
 */
import type { ReactNode } from 'react'
import { PRIVACY_URL, REPO } from './Github'
import { Icon } from './Icon'
import { PageHead } from './PageHead'
import { NoData, Stat, StatGroup } from './Stat'
import { openSupport, supportAvailable } from './Support'
import { backend } from '../api'
import { configured } from '../lib/auth'
import * as fb from '../lib/feedback'
import { fmt } from '../lib/labels'
import { countsPeople, countsVisits } from '../lib/usage'
import type { TaxonomyRow } from '../types'
import { FeedbackLink } from './Feedback'

const UPSTREAM = 'https://github.com/jackwangxyw/Bluebank'

type IconName = Parameters<typeof Icon>[0]['name']

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'grid', title: 'Pick topics', body: 'Select skills on Practice, or narrow one down to a single question type.' },
  { icon: 'clock', title: 'Practice like test day', body: 'A Bluebook-style screen with Desmos built in, and timed sets when you want them.' },
  { icon: 'history', title: 'Review and redo', body: 'Every answer is saved, so you can redo any pile: wrong ones, marked ones, a whole topic.' },
]

function Sec({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="about-sec">
      <h2 className="about-h2">
        <span className="about-ico" aria-hidden="true"><Icon name={icon} size={18} strokeWidth={2} /></span>
        {title}
      </h2>
      <div className="about-body">{children}</div>
    </section>
  )
}

export function About({ taxonomy }: { taxonomy: TaxonomyRow[] }) {
  const canSignIn = configured
  // Counted from the bank itself, so the band never goes stale; a dash until
  // the index has loaded.
  const questions = taxonomy.reduce((sum, r) => sum + r.n, 0)
  const skills = new Set(taxonomy.map((r) => r.skill)).size
  const count = (n: number) => (taxonomy.length ? fmt(n) : <NoData />)
  return (
    <>
    <PageHead tone="ink" eyebrow="Free · open source · no ads" title={<>About Light<span className="phead-blue">Blue</span>Prep</>}
              sub="Every question in College Board's official SAT Question Bank, free, in one place you can filter, track and re-drill.">
      <StatGroup>
        <Stat size="l" label="Questions" value={count(questions)} />
        <Stat size="l" label="Skills" value={count(skills)} />
        <Stat size="l" label="Ads" value="0" />
      </StatGroup>
    </PageHead>
    <div className="aboutpage">

      <Sec icon="book" title="How it works">
        <ol className="about-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <Icon name={s.icon} size={20} strokeWidth={2} />
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        {backend === 'local' ? (
          <p className="about-p">
            <a className="about-link about-more" href="/skills/">
              Browse every SAT skill <Icon name="arrow-right" size={16} strokeWidth={2.2} />
            </a>
          </p>
        ) : null}
        <p className="about-p">
          LightBluePrep does not host the questions. Your browser downloads them
          straight from College Board and keeps a copy, so the first visit takes
          a few seconds and after that it is fast and works offline.
        </p>
      </Sec>

      <Sec icon="shield" title="Privacy">
        <p className="about-p">
          No account needed.{' '}
          <strong>
            {countsVisits || countsPeople ? 'No ads, no tracking cookies.' : 'No ads, no analytics, no tracking.'}
          </strong>{' '}
          Your answers, notes and marks are saved in your own browser and never
          leave it{canSignIn ? ' unless you sign in' : ''}. Feedback you send is
          stored anonymously, with no name, email or account attached.
        </p>
        {countsVisits || countsPeople ? (
          <p className="about-p">
            {countsVisits ? 'Visits are counted with Cloudflare Web Analytics, which sets no cookies and stores nothing on your device. ' : ''}
            {countsPeople ? 'To see how many people use the site, your browser tells our server once when it answers its first question and once at its tenth, with no ID attached.' : ''}
          </p>
        ) : null}
        <p className="about-p">
          Your browser talks to College Board to fetch the questions, and to
          Desmos only if you open the calculator. Both see your IP address, like
          any website does.
        </p>
        {canSignIn ? (
          <p className="about-p">
            Signing in with Google syncs your practice history between devices.
            We keep only an anonymous account ID from Google, never your email,
            name or photo, and you can delete everything on the server from the
            sync panel.
          </p>
        ) : null}
        <p className="about-p">
          To wipe your history, open Settings.{' '}
          <a className="about-link" href={PRIVACY_URL}>Read the full privacy policy</a>
        </p>
      </Sec>

      <Sec icon="message" title="Found a bug? Got an idea?">
        <p className="about-p">
          Tell me. Messages are anonymous and go straight to me. To report a
          problem with one question, use the link under that question.
        </p>
      </Sec>

      {supportAvailable ? (
        <Sec icon="heart" title="Support">
          <p className="about-p">
            LightBluePrep is free and stays free. Nothing is locked behind
            payment. Donations only pay for the domain and hosting.
          </p>
        </Sec>
      ) : null}

      <Sec icon="code" title="Credits and license">
        <p className="about-p">
          LightBluePrep is built on{' '}
          <a className="about-link" href={UPSTREAM} target="_blank" rel="noreferrer">
            Bluebank<span className="sr-only"> (opens in a new tab)</span></a>{' '}
          by jackwangxyw, and changes it with a new question browser, College
          Board question IDs and more. Both are free software under the GNU
          General Public License v3, so you can read, copy and change the
          code. The full source is on{' '}
          <a className="about-link" href={REPO} target="_blank" rel="noreferrer">GitHub<span className="sr-only"> (opens in a new tab)</span></a>.
        </p>
        <p className="about-p">
          It ships React and MathJax, the Bricolage Grotesque and Noto fonts
          (SIL Open Font License) and embeds the Desmos calculator.{' '}
          <a className="about-link about-nowrap" href="/third-party-licenses.txt" target="_blank" rel="noreferrer">
            Open-source licenses<span className="sr-only"> (opens in a new tab)</span></a>
        </p>
      </Sec>

      <Sec icon="info" title="Disclaimer">
        <p className="about-p">
          LightBluePrep is a free, non-commercial student project. It is not
          affiliated with or endorsed by College Board. SAT and Bluebook are
          trademarks of College Board.
        </p>
      </Sec>

      {supportAvailable || fb.available ? (
        <div className="about-actions">
          {supportAvailable ? (
            <div className="about-action">
              <p><strong>Keep it free</strong>Donations pay for the domain and hosting.</p>
              <button type="button" className="btn primary" onClick={openSupport}>
                <Icon name="heart" size={16} strokeWidth={2.2} /> Support LightBluePrep
              </button>
            </div>
          ) : null}
          {fb.available ? (
            <div className="about-action">
              <p><strong>Tell me what to fix</strong>Anonymous, and it goes straight to me.</p>
              <FeedbackLink label="Send feedback" className="btn" ctx={{ context: 'about' }} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
    </>
  )
}
