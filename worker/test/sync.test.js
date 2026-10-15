// The Worker end to end, through its fetch handler, against the real schema in
// an in-memory D1 stand-in (./d1.js). Sessions are seeded straight into the
// database: sign-in itself needs Google and is not what these tests are about.

import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'

import worker from '../src/index.js'
import { makeD1 } from './d1.js'

const TABLES = ['attempts', 'marks', 'annotations', 'mistakes', 'sets', 'cursors', 'sessions', 'users']
const nowSec = () => Math.floor(Date.now() / 1000)

function freshEnv() {
  return { DB: makeD1() }
}

/** A session for `sub`, as /auth/google would have stored it. Returns the bearer token. */
function signIn(env, sub, { expiresAt = nowSec() + 60 * 86400 } = {}) {
  const token = randomBytes(32).toString('hex')
  const hashed = createHash('sha256').update(token).digest('hex')
  env.DB.sqlite.prepare('INSERT OR IGNORE INTO users (sub, created_at) VALUES (?, ?)').run(sub, nowSec())
  env.DB.sqlite.prepare('INSERT INTO sessions (token, sub, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashed, sub, nowSec(), expiresAt)
  return token
}

/** @param {object | string} body @param {Record<string, string>} [headers] */
function post(path, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('https://sync.test' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(text)), ...headers },
    body: text,
  })
}

async function sync(env, token, body) {
  const res = await worker.fetch(post('/sync', body, { Authorization: 'Bearer ' + token }), env)
  return { status: res.status, body: await res.json() }
}

const rowsFor = (env, table, sub) =>
  env.DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE sub = ?`).get(sub).n

const attempt = (id, over = {}) => ({ id, question_id: 'q-' + id, answered_at: nowSec(), correct: 1, ...over })

test('a sync stores clean rows and drops malformed ones', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  // Raw JSON, so 1e999 arrives as Infinity exactly as it would from a client.
  const raw = '{"attempts":[{"id":"good","question_id":"q1","answered_at":' + nowSec() + ',"correct":1,'
    + '"response":"' + 'r'.repeat(300) + '"},'
    + '{"id":"inf","question_id":"q1","answered_at":1e999,"correct":1},'
    + '{"id":"bad/id","question_id":"q1","answered_at":1,"correct":1}],'
    + '"annotations":[{"question_id":"q1","updated_at":' + Date.now() + ',"items":['
    + '{"field":"stem","start_offset":0,"end_offset":4,"color":"red"},'
    + '{"field":"stem","start_offset":0,"end_offset":4,"color":"blue"}]}]}'
  const { status, body } = await sync(env, token, raw)
  assert.equal(status, 200)
  assert.deepEqual(body.attempts.map((a) => a.id), ['good'])
  assert.equal(body.attempts[0].response.length, 200)
  assert.deepEqual(body.annotations[0].items.map((h) => h.color), ['blue'])
  assert.equal(rowsFor(env, 'attempts', 'alice'), 1)
})

test('an oversize body is refused before it is read, and one with no length too', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  const big = post('/sync', '{}', { Authorization: 'Bearer ' + token, 'Content-Length': String(5 * 1024 * 1024) })
  assert.equal((await worker.fetch(big, env)).status, 413)
  const unsized = new Request('https://sync.test/sync', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: '{}',
  })
  assert.equal((await worker.fetch(unsized, env)).status, 411)
  const junk = post('/sync', 'not json', { Authorization: 'Bearer ' + token })
  assert.equal((await worker.fetch(junk, env)).status, 400)
})

test('at a ceiling only that table\'s new rows are refused', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  const old = Date.now() - 60_000
  await sync(env, token, { marks: [{ question_id: 'kept', flagged: true, updated_at: old }] })
  // The ceiling reads the stored count from the cursor row, so set it there
  // rather than writing 10,000 marks.
  env.DB.sqlite.prepare('UPDATE cursors SET n_marks = 10000 WHERE sub = ?').run('alice')

  const { status, body } = await sync(env, token, {
    marks: [
      { question_id: 'kept', flagged: false, updated_at: Date.now() },
      { question_id: 'new-one', flagged: true, updated_at: Date.now() },
    ],
    attempts: [attempt('a1')],
  })
  assert.equal(status, 200)
  assert.deepEqual(body.refused, ['marks'])
  assert.deepEqual(body.marks.map((m) => [m.question_id, m.flagged]), [['kept', 0]],
    'an update to a mark already stored still syncs')
  assert.equal(rowsFor(env, 'marks', 'alice'), 1)
  assert.deepEqual(body.attempts.map((a) => a.id), ['a1'], 'other tables still sync')
})

test('last write wins, and an older write is neither stored nor echoed', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  const newer = Date.now()
  const first = await sync(env, token, { marks: [{ question_id: 'q1', flagged: true, updated_at: newer }] })
  const second = await sync(env, token, {
    since: first.body.cursor,
    marks: [{ question_id: 'q1', flagged: false, updated_at: newer - 1000 }],
  })
  assert.equal(second.status, 200)
  assert.deepEqual(second.body.marks, [])
  const row = env.DB.sqlite.prepare('SELECT flagged, updated_at FROM marks WHERE sub = ?').get('alice')
  assert.deepEqual({ ...row }, { flagged: 1, updated_at: newer })
})

test('deleting an account leaves no row for it, even with a sync in flight', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  const bob = signIn(env, 'bob')
  const now = Date.now()
  const everything = {
    attempts: [attempt('a1')],
    marks: [{ question_id: 'q1', flagged: true, updated_at: now }],
    annotations: [{ question_id: 'q1', updated_at: now, items: [] }],
    mistakes: [{ question_id: 'q1', tags: ['silly'], note: 'n', updated_at: now }],
    sets: [{ id: 's1', created_at: now, updated_at: now, items: [] }],
  }
  await sync(env, token, everything)
  await sync(env, bob, everything)

  const del = new Request('https://sync.test/me', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
  const [late] = await Promise.all([
    sync(env, token, { ...everything, attempts: [attempt('a2')] }),
    worker.fetch(del, env),
  ])
  assert.ok([200, 401].includes(late.status))
  for (const table of TABLES) assert.equal(rowsFor(env, table, 'alice'), 0, table)
  assert.equal(rowsFor(env, 'attempts', 'bob'), 1, 'another account is untouched')
  assert.equal((await sync(env, token, {})).status, 401, 'the session went with it')
})

test('two syncs in flight at once each end up with the other\'s rows', async () => {
  const env = freshEnv()
  const laptop = signIn(env, 'alice')
  const phone = signIn(env, 'alice')
  const [a, b] = await Promise.all([
    sync(env, laptop, { attempts: [attempt('from-laptop')] }),
    sync(env, phone, { attempts: [attempt('from-phone')] }),
  ])
  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
  // Each device then pulls from the cursor it was handed, as the client does.
  const [a2, b2] = await Promise.all([
    sync(env, laptop, { since: a.body.cursor }),
    sync(env, phone, { since: b.body.cursor }),
  ])
  const seen = (...replies) => new Set(replies.flatMap((r) => r.body.attempts.map((x) => x.id)))
  assert.ok(seen(a, a2).has('from-phone'), 'the laptop never saw the phone\'s attempt')
  assert.ok(seen(b, b2).has('from-laptop'), 'the phone never saw the laptop\'s attempt')
})

test('a long history comes back a page at a time, with nothing skipped', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice')
  const total = 2600
  const insert = env.DB.sqlite.prepare(
    'INSERT INTO attempts (sub, id, question_id, answered_at, correct, seq) VALUES (?, ?, ?, ?, 1, ?)')
  // Rows 2490 to 2510 share one seq, as one request's writes do, so the first
  // page of 2500 ends partway through that group.
  for (let i = 1; i <= total; i++) {
    insert.run('alice', 'a' + i, 'q' + i, nowSec(), i >= 2490 && i <= 2510 ? 2490 : i)
  }
  env.DB.sqlite.prepare('INSERT INTO cursors (sub, seq, n_attempts) VALUES (?, ?, ?)').run('alice', total, total)

  const ids = new Set()
  let returned = 0
  let since = 0
  let pages = 0
  for (;;) {
    const { status, body } = await sync(env, token, { since })
    assert.equal(status, 200)
    for (const a of body.attempts) ids.add(a.id)
    returned += body.attempts.length
    assert.ok(body.cursor > since || !body.more, 'every page moves the cursor')
    since = body.cursor
    pages++
    if (!body.more) break
    assert.ok(pages < 5, 'paging never finished')
  }
  assert.equal(pages, 2)
  assert.equal(ids.size, total)
  assert.equal(returned, total, 'the split seq group is held back whole, not sent twice')
})

test('an expired session is a 401 and is removed', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice', { expiresAt: nowSec() - 1 })
  const { status } = await sync(env, token, {})
  assert.equal(status, 401)
  assert.equal(rowsFor(env, 'sessions', 'alice'), 0)
  assert.equal((await sync(env, 'not-a-token', {})).status, 401)
})

test('a session near its end is extended', async () => {
  const env = freshEnv()
  const token = signIn(env, 'alice', { expiresAt: nowSec() + 86400 })
  assert.equal((await sync(env, token, {})).status, 200)
  const { expires_at } = env.DB.sqlite.prepare('SELECT expires_at FROM sessions WHERE sub = ?').get('alice')
  assert.ok(expires_at > nowSec() + 80 * 86400)
})

test('feedback is stored, and refused once the day\'s ceiling is reached', async () => {
  const env = freshEnv()
  const send = (body) => worker.fetch(post('/feedback', body), env)
  assert.equal((await send({ kind: 'bug', message: 'x'.repeat(2001) })).status, 400)
  assert.equal((await send({ kind: 'spam', message: 'hi' })).status, 400)
  assert.equal((await send({ kind: 'bug', message: 'Question 3 has no figure' })).status, 200)
  const count = () => env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get().n
  assert.equal(count(), 1)

  const today = new Date().toISOString().slice(0, 10)
  env.DB.sqlite.prepare('UPDATE feedback_daily SET n = 300 WHERE day = ?').run(today)
  const capped = await send({ kind: 'comment', message: 'one too many' })
  assert.equal(capped.status, 429)
  assert.equal(count(), 1)
})

test('an origin that is not the site is refused', async () => {
  const env = freshEnv()
  const res = await worker.fetch(post('/feedback', { kind: 'bug', message: 'hi' }, { Origin: 'https://evil.example' }), env)
  assert.equal(res.status, 403)
})
