/**
 * Your own questions (web/custom-questions.mjs), on localhost only: how many,
 * how many are still unanswered, and one button to practise them, the
 * unanswered first and newest first within each. Renders nothing in a real
 * build, where there never are any.
 */
import { useEffect, useState } from 'react'
import * as api from '../../api'
import { Icon } from '../Icon'
import { fmt, plural } from '../../lib/labels'

export function MyQuestions({ onPractice }: { onPractice: (ids: string[], title: string) => void }) {
  const [ids, setIds] = useState<{ all: string[]; open: number } | null>(null)
  useEffect(() => {
    let stale = false
    Promise.all([api.customIds(), api.questionsById()]).then(([all, byId]) => {
      if (stale || !all.length) return
      const open = all.filter((id) => !byId.get(id)?.answered_at)
      setIds({ all: [...open, ...all.filter((id) => byId.get(id)?.answered_at)], open: open.length })
    }).catch(() => {})
    return () => { stale = true }
  }, [])
  if (!ids) return null
  return (
    <section className="railc myq" aria-labelledby="myq-t">
      <div>
        <h2 className="railc-t" id="myq-t">My questions</h2>
        <p className="railc-sub">{plural(ids.all.length, 'question')} added · {fmt(ids.open)} not answered yet</p>
      </div>
      <button type="button" className="btn primary" onClick={() => onPractice(ids.all, 'My questions')}>
        Practice them
        <Icon name="arrow-right" size={16} strokeWidth={2.2} />
      </button>
    </section>
  )
}
