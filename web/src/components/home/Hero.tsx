import { Mascot } from '../Mascot'
import { fmt } from '../../lib/labels'
import type { SetItem } from '../../types'
import { IdSearch } from './IdSearch'

/**
 * Home's hero: Bulb, one bold line and the ID search. Slim on purpose, so the
 * topics start on the first screen. What to do next lives in NextUp.
 */
export function Hero({ total, findIds, onOpenId }: {
  /** Questions in the bank; 0 while the list is still loading. */
  total: number
  findIds: (needle: string) => Promise<{ hits: SetItem[]; total: number }>
  onOpenId: (id: string) => void
}) {
  return (
    <section className="hero3" aria-label="Overview">
      <div className="hero3-in">
        <Mascot className="hero3-bulb" mood="cheer" size={60} />
        <div className="hero3-copy">
          <h1 className="hero3-t" tabIndex={-1}>Pick a topic. <span className="hero3-hl">Start drilling.</span></h1>
          <p className="hero3-sub">
            {total ? `${fmt(total)} official College Board questions.` : 'Official College Board questions.'} Free, no account, no ads.
          </p>
        </div>
        <IdSearch findIds={findIds} onOpenId={onOpenId} />
      </div>
    </section>
  )
}
