/**
 * Catches a render that throws, so one malformed question (College Board HTML
 * through RichText, MathJax and the sanitizer) shows Bulb and a way out
 * instead of a blank white page.
 */
import { Component, type ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { FeedbackHost, FeedbackLink } from './Feedback'

interface Props {
  children: ReactNode
  /** Leave the broken screen. The boundary clears itself after calling it. */
  onReset: () => void
  /** Which screen, for the feedback report. */
  context: string
  /** Around the whole app: nothing else is left to draw the frame or the dialog. */
  standalone?: boolean
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: unknown) { console.error(error) }

  reset = () => { this.props.onReset(); this.setState({ failed: false }) }

  render() {
    if (!this.state.failed) return this.props.children
    const oops = (
      <EmptyState mood="oops" className="crash" title="Something broke on this page."
                  body="Your answers so far are saved.">
        <button type="button" className="btn primary" onClick={this.reset}>Back to Practice</button>
        <FeedbackLink label="Report this problem"
                      ctx={{ kind: 'bug', context: `crash:${this.props.context}` }} />
      </EmptyState>
    )
    if (!this.props.standalone) return oops
    return (
      <div className="shell">
        <main id="main" className="page crash-page">{oops}</main>
        <FeedbackHost />
      </div>
    )
  }
}
