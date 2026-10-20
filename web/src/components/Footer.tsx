/**
 * The slim footer under every page except practice: the promises, the College
 * Board disclaimer, and the links that used to live only on About. It is also
 * the only internal link most pages give the /skills/ index.
 *
 * Plain links to the static pages, not router views: they are separate HTML
 * files (see scripts/skill_pages.py and public/privacy.html).
 */
import { FeedbackLink } from './Feedback'
import { PRIVACY_URL, REPO } from '../lib/links'
import { available as feedbackAvailable } from '../lib/feedback'

/** `context` tags a feedback message with the page it was sent from. */
export function Footer({ context }: { context: string }) {
  return (
    <footer className="foot">
      <div className="foot-in">
        <p className="foot-promise">Free forever · No ads · No account needed</p>
        <p>
          Not affiliated with or endorsed by College Board. SAT and Bluebook are
          trademarks of College Board.
        </p>
        <ul className="foot-links">
          {/* On a phone About has no tab (Plan has its slot), so it lives here. */}
          <li><a href="#about">About</a></li>
          <li><a href="/skills/">All SAT skills</a></li>
          <li><a href={PRIVACY_URL}>Privacy</a></li>
          <li><a href={REPO} target="_blank" rel="noreferrer">Source<span className="sr-only"> (opens in a new tab)</span></a></li>
          {feedbackAvailable ? <li><FeedbackLink label="Send feedback" ctx={{ context }} /></li> : null}
        </ul>
      </div>
    </footer>
  )
}
