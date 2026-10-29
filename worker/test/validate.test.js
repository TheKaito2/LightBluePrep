// The clean* validators: what the Worker keeps of a row a client sent, and
// what it drops. Malformed rows are dropped one by one, never the whole sync.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cleanAnnotations, cleanAttempts, cleanMarks, cleanMistakes, cleanSets, existingKeys,
} from '../src/index.js'
import { makeD1 } from './d1.js'

const nowSec = () => Math.floor(Date.now() / 1000)

const attempt = (over = {}) => ({
  id: 'a1', question_id: 'q1', answered_at: nowSec(), response: 'B', correct: 1, seconds: 30, ...over,
})

test('bad ids are dropped, good ones kept', () => {
  const rows = cleanAttempts([
    attempt({ id: 'ok-id_1' }),
    attempt({ id: 'has/slash' }),
    attempt({ id: 'x'.repeat(65) }),
    attempt({ id: '' }),
    attempt({ id: 42 }),
    attempt({ id: 'a2', question_id: '../etc' }),
    attempt({ id: '015193-DC' }),
  ])
  assert.deepEqual(rows.map((r) => r.id), ['ok-id_1', '015193-DC'])
  assert.deepEqual(cleanMarks([{ question_id: 'q 1', flagged: true, updated_at: Date.now() }]), [])
  assert.deepEqual(cleanAttempts('not a list'), [])
  assert.deepEqual(cleanAttempts([null, 7, 'x']), [])
})

test('oversize strings are cut to their ceiling', () => {
  const [a] = cleanAttempts([attempt({ response: 'r'.repeat(5000) })])
  assert.equal(a.response.length, 200)
  const [m] = cleanMistakes([{ question_id: 'q1', tags: [], note: 'n'.repeat(9000), updated_at: Date.now() }])
  assert.equal(m.note.length, 4000)
  const [n] = cleanAnnotations([{
    question_id: 'q1',
    updated_at: Date.now(),
    items: [
      { field: 'stem', start_offset: 0, end_offset: 3, color: 'yellow', note: 'n'.repeat(3000) },
      { field: 'f'.repeat(41), start_offset: 0, end_offset: 3, color: 'yellow' },
    ],
  }])
  assert.equal(n.items.length, 1, 'a field name over 40 characters is dropped')
  assert.equal(n.items[0].note.length, 1000)
  const [s] = cleanSets([{
    id: 's1', created_at: Date.now(), updated_at: Date.now(),
    items: [{ question_id: 'q1', response: 'x'.repeat(999) }],
  }])
  assert.equal(s.items[0].response.length, 200)
  // Every skill and question type ticked is about 7 KB of filters, and must sync.
  assert.equal(cleanSets([{
    id: 's3', created_at: Date.now(), updated_at: Date.now(), items: [], filters: { q: 'x'.repeat(7000) },
  }]).length, 1)
  const oversize = []
  assert.deepEqual(cleanSets([{
    id: 's2', created_at: Date.now(), updated_at: Date.now(), items: [], filters: { q: 'x'.repeat(17000) },
  }], oversize), [], 'a set whose filters are over 16 KB is not a set')
  assert.deepEqual(oversize, ['sets'], 'and the reply says so, so the client keeps it queued')
})

test('non-finite and future numbers are dropped or clamped', () => {
  // JSON.parse turns 1e999 into Infinity, so this is a real request shape.
  const body = JSON.parse('{"a":[{"id":"a1","question_id":"q1","answered_at":1e999,"correct":1}],'
    + '"m":[{"question_id":"q1","flagged":true,"updated_at":-1e999}]}')
  assert.deepEqual(cleanAttempts(body.a), [])
  assert.deepEqual(cleanMarks(body.m), [])
  assert.deepEqual(cleanAttempts([attempt({ correct: Number.NaN })]), [])
  assert.deepEqual(cleanAttempts([attempt({ answered_at: nowSec() + 3 * 86400 })]), [], 'answered in the future')
  assert.deepEqual(cleanMarks([{ question_id: 'q1', updated_at: Date.now() + 3 * 86400e3 }]), [])

  const [a] = cleanAttempts([attempt({ seconds: Infinity })])
  assert.equal(a.seconds, null)
  assert.equal(cleanAttempts([attempt({ seconds: -5 })])[0].seconds, 0)
  assert.equal(cleanAttempts([attempt({ seconds: 1e9 })])[0].seconds, 86400)
  const [s] = cleanSets([{
    id: 's1', created_at: Date.now(), updated_at: Date.now(), seconds: Infinity, finished_at: NaN,
    items: [{ question_id: 'q1', seconds: -Infinity }],
  }])
  assert.equal(s.seconds, 0)
  assert.equal(s.finished_at, null, 'a non-finite finish time reads as still active')
  assert.equal(s.items[0].seconds, 0)
})

test('unknown highlight colours and mistake tags are dropped', () => {
  const [n] = cleanAnnotations([{
    question_id: 'q1',
    updated_at: Date.now(),
    items: ['yellow', 'red', 'blue', '#ff0000', 'underline', 'pink'].map((color, i) => ({
      field: 'stem', start_offset: i, end_offset: i + 1, color,
    })),
  }])
  assert.deepEqual(n.items.map((h) => h.color), ['yellow', 'blue', 'underline', 'pink'])
  const [m] = cleanMistakes([{ question_id: 'q1', tags: ['silly', 'invented', 'process'], updated_at: Date.now() }])
  assert.deepEqual(m.tags, ['silly', 'process'])
  const tooMany = Array.from({ length: 101 }, (_, i) => ({ field: 'stem', start_offset: i, end_offset: i, color: 'blue' }))
  assert.deepEqual(cleanAnnotations([{ question_id: 'q1', updated_at: Date.now(), items: tooMany }]), [])
})

test('a deleted set is stored as an empty tombstone', () => {
  const [s] = cleanSets([{
    id: 's1', created_at: 1, updated_at: Date.now(), deleted: true,
    filters: { section: 'math' }, items: [{ question_id: 'q1', response: 'A' }],
  }])
  assert.deepEqual({ items: s.items, filters: s.filters, deleted: s.deleted }, { items: [], filters: {}, deleted: 1 })
})

test('one request is held to 2000 rows per table', () => {
  const many = Array.from({ length: 2500 }, (_, i) => attempt({ id: 'a' + i }))
  assert.equal(cleanAttempts(many).length, 2000)
})

test('existingKeys looks past the 90-key chunk and stays inside one account', async () => {
  const DB = makeD1()
  const insert = DB.sqlite.prepare(
    'INSERT INTO marks (sub, question_id, flagged, updated_at, seq) VALUES (?, ?, 1, 1, 1)')
  for (let i = 0; i < 200; i++) insert.run('alice', 'q' + i)
  insert.run('bob', 'only-bob')
  const keys = [...Array.from({ length: 200 }, (_, i) => 'q' + i), 'only-bob', 'missing']
  const found = await existingKeys({ DB }, 'alice', 'marks', 'question_id', keys)
  assert.equal(found.size, 200)
  assert.ok(!found.has('only-bob') && !found.has('missing'))
})
