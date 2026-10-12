/**
 * About, privacy, credits.
 *
 * The privacy part must stay true to what the build actually does: what is
 * collected, what is not, how to delete it. Keep it in step with
 * public/privacy.html.
 */

import { REPO } from './Github'
import { PageHead } from './PageHead'
import { openSupport, supportAvailable } from './Support'
import { configured } from '../lib/auth'
import { countsPeople, countsVisits } from '../lib/usage'
import { FeedbackLink } from './Feedback'

const UPSTREAM = 'https://github.com/jackwangxyw/Bluebank'

export function About() {
  const canSignIn = configured
  return (
    <>
    <PageHead tone="ink" eyebrow="Free · open source · no ads" title={<>About Light<span className="phead-blue">Blue</span>Prep</>}
              sub="Every official College Board practice question, free, in one place you can filter, track and re-drill." />
    <div className="about">

      <section className="about-block">
        <h2 className="about-h2">How it works</h2>
        <p className="about-p">
          Tick the topics you want on Practice, narrow a topic down to one kind
          of question if you like, and start. Options lets you skip what you
          have already done, drill only the ones you got wrong, or run a timed
          set. Review keeps everything you answered, so you can redo a whole
          pile at once or practise questions solved the same way.
        </p>
        <p className="about-p">
          LightBluePrep does not host the questions. Your browser downloads them
          straight from College Board and keeps a copy, so the first visit takes
          a few seconds and after that it is fast and works offline.
        </p>
        <p className="about-p">
          Tap Info on any question for its College Board ID. Copy it, or tap
          YouTube to look for a walkthrough of that exact question.
        </p>
      </section>

      <section className="about-block">
        <h2 className="about-h2">Privacy</h2>
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
          To wipe your history, clear this site's data in your browser settings.
          Full policy: <a className="about-link" href="/privacy.html">privacy.html</a>.
        </p>
      </section>

      {supportAvailable ? (
        <section className="about-block">
          <h2 className="about-h2">Support</h2>
          <p className="about-p">
            LightBluePrep is free and stays free. Nothing is locked behind
            payment. Donations only pay for the domain and hosting.
          </p>
          <button type="button" className="btn primary" onClick={openSupport}>
            Support LightBluePrep
          </button>
        </section>
      ) : null}

      <section className="about-block">
        <h2 className="about-h2">Found a bug? Got an idea?</h2>
        <p className="about-p">
          Tell me. Messages are anonymous and go straight to me. To report a
          problem with one question, use the link under that question.
        </p>
        <FeedbackLink label="Send feedback" className="btn primary" ctx={{ context: 'about' }} />
      </section>

      <section className="about-block">
        <h2 className="about-h2">Credits and license</h2>
        <p className="about-p">
          LightBluePrep is built on{' '}
          <a className="about-link" href={UPSTREAM} target="_blank" rel="noreferrer">
            Bluebank</a>{' '}
          by jackwangxyw, and changes it with a new question browser, College
          Board question IDs and more. Both are free software under the GNU
          General Public License v3, so you can read, copy and change the
          code. The full source is on{' '}
          <a className="about-link" href={REPO} target="_blank" rel="noreferrer">GitHub</a>.
        </p>
        <p className="about-p">
          It ships React and MathJax, the Bricolage Grotesque and Noto fonts
          (SIL Open Font License) and embeds the Desmos calculator. Their licenses
          are in{' '}
          <a className="about-link" href="/third-party-licenses.txt" target="_blank" rel="noreferrer">
            third-party-licenses.txt</a>.
        </p>
      </section>

      <section className="about-block">
        <h2 className="about-h2">Disclaimer</h2>
        <p className="about-p">
          LightBluePrep is a free, non-commercial student project. It is not
          affiliated with or endorsed by College Board. SAT and Bluebook are
          trademarks of College Board.
        </p>
      </section>
    </div>
    </>
  )
}
