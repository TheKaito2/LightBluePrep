/**
 * Whole-bank integrity check, against the live College Board API.
 *
 * Every question the site can show goes through the app's own client,
 * normaliser and grader here, the same path a browser takes, and is checked:
 * one valid answer key, choices with content, grid-in keys the grader accepts,
 * explanations that agree with the key, maths and images that can render, and
 * index rows that land under the right filters. Skipped in the normal suite:
 *
 *   BANK_CHECK=1 BANK_CACHE=/tmp/bank npx vitest run checks/bank.check.test.ts
 *
 * BANK_CACHE keeps fetched bodies on disk so a re-run is offline. Nothing it
 * writes is ever committed: College Board content stays out of the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchDetail, fetchIndex, fetchLiveItems } from '../src/lib/cbApi'
import { normaliseQuestion, type Stub } from '../src/lib/normalize'
import { classify, flatten } from '../src/lib/rationale'
import { canonical, grade, gradeSpr } from '../src/lib/grading'
import type { StoredQuestion } from '../src/types'

const CACHE = process.env.BANK_CACHE ?? ''
const SKILLS: Record<string, [string, string[]]> = {
  INI: ['RW', ['CID', 'COE', 'INF']], CAS: ['RW', ['WIC', 'TSP', 'CTC']],
  EOI: ['RW', ['SYN', 'TRA']], SEC: ['RW', ['BOU', 'FSS']],
  H: ['MATH', ['H.A.', 'H.B.', 'H.C.', 'H.D.', 'H.E.']], P: ['MATH', ['P.A.', 'P.B.', 'P.C.']],
  Q: ['MATH', ['Q.A.', 'Q.B.', 'Q.C.', 'Q.D.', 'Q.E.', 'Q.F.', 'Q.G.']],
  S: ['MATH', ['S.A.', 'S.B.', 'S.C.', 'S.D.']],
}

async function cached<T>(name: string, load: () => Promise<T>): Promise<T> {
  const file = CACHE && join(CACHE, name)
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const value = await load()
  if (file) writeFileSync(file, JSON.stringify(value))
  return value
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

/** A grid-in entry a student can type: 5 characters, 6 with a leading minus. */
const fitsGrid = (a: string) => {
  const c = canonical(a)
  return c.length <= (c.startsWith('-') ? 6 : 5)
}

const allHtml = (q: StoredQuestion) =>
  [q.stimulus_html, q.stem_html, q.rationale_html, ...(q.options ?? []).map((o) => o.html)].join('\n')

describe.runIf(Boolean(process.env.BANK_CHECK))('question bank integrity (live)', () => {
  it('every question is answerable, keyed once, renderable and filed correctly', async () => {
    if (CACHE) mkdirSync(join(CACHE, 'q'), { recursive: true })
    const stubs = await cached('index.json', fetchIndex)
    const live = await cached('live.json', fetchLiveItems)
    const raws = await pool(stubs, 8, (s: Stub) => cached(join('q', s._id + '.json'), () => fetchDetail(s)))

    const errors: string[] = []
    const warn: Record<string, string[]> = {}
    const note = (kind: string, id: string) => (warn[kind] ??= []).push(id)
    const err = (q: { id: string; cb_id?: string | null }, msg: string) => errors.push(`${q.cb_id ?? q.id}: ${msg}`)
    const bodies = new Map<string, string>()
    const images = new Set<string>()
    const tally = { mcq: 0, spr: 0, RW: 0, MATH: 0, recovered: 0, explanationsDropped: 0, withMath: 0, withImg: 0 }

    expect(new Set(stubs.map((s) => s._id)).size).toBe(stubs.length)
    stubs.forEach((stub, i) => {
      // Filing: the filters match on these four fields, so each must be a known value
      // and agree with the others.
      const domain = SKILLS[stub.primary_class_cd ?? '']
      const ref = { id: stub._id, cb_id: stub.questionId }
      if (!domain) err(ref, `unknown domain ${stub.primary_class_cd}`)
      else {
        if (domain[0] !== stub._section) err(ref, `domain ${stub.primary_class_cd} filed under ${stub._section}`)
        if (!domain[1].includes(stub.skill_cd ?? '')) err(ref, `skill ${stub.skill_cd} not in ${stub.primary_class_cd}`)
      }
      if (!['E', 'M', 'H'].includes(stub.difficulty ?? '')) err(ref, `difficulty ${stub.difficulty}`)
      if (!stub.questionId) err(ref, 'no College Board ID')

      const raw = raws[i]
      if (!raw || typeof raw !== 'object') { err(ref, 'no body'); return }
      const q = normaliseQuestion(stub, raw)
      tally[q.type]++; tally[q.section]++
      if (q.key_recovered) tally.recovered++
      for (const f of q.flags) note(f.replace(/_says_.*|_[A-Z]+$/, ''), q.cb_id ?? q.id)

      if (!flatten(q.stem_html).trim() && !q.stem_html.includes('<img') && !q.stem_html.includes('<svg')) err(q, 'empty stem')
      if (!flatten(q.rationale_html).trim()) err(q, 'no explanation')
      if (q.correct.length === 0) err(q, 'no answer key')

      if (q.type === 'mcq') {
        const labels = (q.options ?? []).map((o) => o.label)
        if (labels.length < 2) err(q, `mcq with ${labels.length} choices`)
        if (labels.length !== 4) note('choices_not_4', q.cb_id ?? q.id)
        for (const o of q.options ?? []) {
          if (!flatten(o.html).trim() && !/<(img|svg|math)/.test(o.html)) err(q, `choice ${o.label} is empty`)
        }
        if (q.correct.length !== 1) err(q, `mcq keyed ${q.correct.length} times: ${q.correct}`)
        if (q.correct[0] && !labels.includes(q.correct[0])) err(q, `key ${q.correct[0]} not among ${labels.join('')}`)
        // The key must grade correct and every other choice wrong.
        for (const l of labels) {
          if (grade(q, l).correct !== (l === q.correct[0])) err(q, `choice ${l} grades wrong way`)
        }
        if (q.explanations) {
          const right = Object.entries(q.explanations).filter(([, h]) => classify(h) === 'correct').map(([l]) => l)
          if (right.join('') !== q.correct[0]) err(q, `explanations say ${right.join('') || 'none'} is right, key ${q.correct[0]}`)
          // College Board's own rationale skips a choice now and then; the UI then shows why the key is right.
          for (const l of labels) if (!q.explanations[l] && !q.flags.some((f) => f.startsWith('missing_explanations'))) err(q, `no explanation for ${l}`)
        } else tally.explanationsDropped++
        if (new Set((q.options ?? []).map((o) => o.html.replace(/\s+/g, ''))).size !== labels.length) err(q, 'two choices are identical')
      } else {
        if (q.options?.length) err(q, 'grid-in with choices')
        for (const a of q.correct) {
          if (!canonical(a)) err(q, `blank accepted answer`)
          else if (!gradeSpr(a, q.correct)[0]) err(q, `accepted "${a}" grades wrong`)
        }
        if (q.correct.length && !q.correct.some(fitsGrid)) err(q, `no accepted answer fits the grid: ${q.correct.join(' | ')}`)
        if (gradeSpr('999999', q.correct)[0] && !q.correct.includes('999999')) err(q, 'any answer grades correct')
        // The explanation's own answer must be one the grader takes.
        // A fraction there is MathML, which flattens to "7 6": read its alttext instead.
        const after = /correct answer is\s*(?:<[^>]*>\s*)*?(<math[^>]*alttext="([^"]*)"|(-?\d[\d,]*(?:\.\d+)?))/i.exec(q.rationale_html)
        const alt = after?.[2]?.replace(/StartFraction (.+?) Over (.+?) EndFraction/, '$1/$2').replace(/negative /g, '-').replace(/\s+/g, '')
        const said = after && [after[0], alt ?? after[3] ?? '']
        if (said && said[1] && !/\d/.test(said[1])) note('rationale_answer_in_words', `${q.cb_id}: ${said[1]} vs ${q.correct.join('|')}`)
        else if (said && said[1] && !gradeSpr(said[1], q.correct)[0]) note('rationale_answer_differs', `${q.cb_id}: "${said[1]}" vs ${q.correct.join('|')}`)
      }

      const html = allHtml(q)
      const opens = (html.match(/<math[\s>]/g) ?? []).length
      const closes = (html.match(/<\/math>/g) ?? []).length
      if (opens) tally.withMath++
      if (opens !== closes) err(q, `unbalanced <math>: ${opens} open, ${closes} close`)
      if (/\\(frac|sqrt|left|right)\b|\$\$/.test(flatten(html))) err(q, 'raw LaTeX in text')
      if (/&[a-z]+;/i.test(flatten(html))) note('unescaped_entity', q.cb_id ?? q.id)
      for (const m of html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)) {
        tally.withImg++
        if (!/^(https:|data:image\/)/.test(m[1])) err(q, `image src not https/data: ${m[1].slice(0, 60)}`)
        else if (m[1].startsWith('https:')) images.add(m[1])
      }
      if (/<img(?![^>]*\salt=)/.test(html)) note('img_without_alt', q.cb_id ?? q.id)

      const body = flatten(q.stimulus_html + q.stem_html + (q.options ?? []).map((o) => o.html).join('')).replace(/\s+/g, ' ').trim()
      const dupe = bodies.get(body)
      if (dupe) note('duplicate_body', `${dupe} = ${q.cb_id}`)
      else bodies.set(body, q.cb_id ?? q.id)
    })

    // Every distinct external image must load.
    const broken = (await pool([...images], 8, async (url) => {
      const res = await fetch(url, { method: 'HEAD' }).catch(() => null)
      return res?.ok ? null : `${url} -> ${res?.status ?? 'network error'}`
    })).filter(Boolean) as string[]
    errors.push(...broken.map((b) => `image: ${b}`))

    const liveIds = new Set([...live.RW, ...live.MATH])
    const report = {
      questions: stubs.length, ...tally, liveListed: liveIds.size,
      liveInBank: stubs.filter((s) => s._path === 'external_id' && live[s._section].includes(s._id)).length,
      externalImages: images.size, brokenImages: broken.length,
      warnings: Object.fromEntries(Object.entries(warn).map(([k, v]) => [k, { n: v.length, sample: v.slice(0, 8) }])),
      errors: errors.length,
    }
    console.log(JSON.stringify(report, null, 2))
    if (CACHE) writeFileSync(join(CACHE, 'report.json'), JSON.stringify({ ...report, errorList: errors, warnAll: warn }, null, 2))
    expect(errors).toEqual([])
  }, 30 * 60_000)
})
