/**
 * LightBluePrep cloud sync (from Bluebank).
 *
 * PLAIN JAVASCRIPT, ONE FILE, ON PURPOSE. Setup is done through the Cloudflare
 * dashboard rather than wrangler, and the dashboard's Edit Code editor runs
 * JavaScript: TypeScript syntax (interfaces, type annotations, generics) is a
 * syntax error there. So this file has to paste in and run as-is, with no
 * imports, no bundler, no npm and no build step. Do not convert it to .ts
 * without also changing the deploy method in HANDOFF 7d.
 *
 * Editor support comes from worker/jsconfig.json plus worker/types.d.ts, which
 * declare the D1 surface locally. That is why no @cloudflare/workers-types
 * dependency is needed.
 *
 * Bindings expected (Worker -> Settings -> Bindings / Variables and Secrets):
 *   DB                D1 database binding, named exactly `DB`
 *   GOOGLE_CLIENT_ID  secret, the OAuth client id ending .apps.googleusercontent.com
 *   ALLOWED_SUBS      secret, OPTIONAL. Comma-separated Google subs. Unset means
 *                     anyone may sign in; setting it makes the site single-user
 *                     again, which is the kill switch.
 *   ADMIN_SUBS        secret. Subs allowed to read the feedback inbox.
 *   AUTH_LIMITER, SYNC_LIMITER, FEEDBACK_LIMITER, MILESTONE_LIMITER
 *                     rate limit bindings (wrangler.jsonc). Each is optional:
 *                     unbound means unlimited, so a dashboard paste still runs.
 *
 * Data policy, enforced here and not just documented: the only identifier
 * stored is the Google `sub`. The email in the verified token is read to check
 * nothing and is never written, never logged, never returned.
 *
 * ---------------------------------------------------------------------------
 * On schema.sql, which is deliberately comment-free and one statement per line.
 *
 * The D1 dashboard console splits pasted input on `;` with no understanding of
 * SQL, then sends each fragment as its own query. Two ways that bites:
 *
 *   - A `;` inside a `--` comment cuts a CREATE TABLE in half. The console
 *     reports "incomplete input" even though the file is valid SQLite.
 *   - A fragment with no SQL left in it (a comment-only block, or the text
 *     after the final `;`) is sent as an empty query, and D1 rejects the whole
 *     request with "requests without any query are not supported".
 *
 * So schema.sql carries no comments at all and the notes live here instead.
 * The design behind it:
 *
 *   users        No email column, on purpose. The `sub` is the only identifier
 *                stored anywhere in this system.
 *   sessions     Opaque tokens, so revocation is a DELETE and there is no JWT
 *                signing code to get wrong.
 *   seq          A per-user counter assigned by the server, and the sync
 *                cursor. Client clocks are never compared, so skew between two
 *                machines cannot reorder anything. Gaps in seq are harmless:
 *                everything compares with `>`.
 *   attempts     PRIMARY KEY (sub, id) is what makes the merge a union.
 *   marks,       PRIMARY KEY (sub, question_id), last-write-wins on updated_at,
 *   annotations  guarded server-side in handleSync below.
 *   cursors      Also holds n_<table>: how many rows each account has, kept
 *                current on every write so the storage ceilings never need a
 *                COUNT(*). NULL means "not counted yet" and is filled once.
 *   sets.deleted A tombstone. A deleted set keeps its row (emptied) so the
 *                deletion syncs to every device like any other change.
 *   milestones   One total per day per step (see handleMilestone). No id of any
 *                kind: it cannot say who was counted, only how many.
 *
 * Existing databases: run each file in worker/migrations/ once.
 * ---------------------------------------------------------------------------
 */

/**
 * Exact origins allowed to call this. Scheme + host + port, never a path.
 * Add the custom domain here when the frontend moves off GitHub Pages; that
 * plus the same string in Google's Authorized JavaScript origins is the whole
 * migration.
 */
const ALLOWED_ORIGINS = [
  'https://lightblueprep.pages.dev',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:8010',
]

const SESSION_DAYS = 90
/** Sessions kept per account. Signing in on an eleventh device ends the oldest. */
const MAX_SESSIONS = 10

/** Ceiling per request, so one call cannot fill the database. */
const MAX_ITEMS_PER_REQUEST = 2000

/**
 * Body ceilings, checked before anything is parsed. The client sends sync in
 * batches of 500 changes, which real data keeps well under a megabyte.
 */
const BODY_LIMIT = {
  auth: 8 * 1024,
  feedback: 16 * 1024,
  admin: 4 * 1024,
  sync: 4 * 1024 * 1024,
}

/**
 * Ceilings per account, so one signed-in user cannot fill it either. Checked in
 * handleSync against the row count already stored.
 *
 * These are not tuning knobs, they are abuse stops, and every one of them is
 * far out of reach of a real user. marks, annotations and mistakes are keyed
 * PRIMARY KEY (sub, question_id), so a person cannot exceed one row per
 * question in the bank, which is under 4,000: the 20,000 ceiling is five times
 * a full sweep of every question that exists. Sets are keyed on a uuid and so
 * are unbounded in principle, but 5,000 of them is years of daily practice.
 *
 * `question_id` is never checked against the real bank, which is what makes
 * these necessary: without them one account can invent question ids and write
 * rows until D1 is full.
 */
const CAPS = {
  attempts: 100000,
  marks: 10000,
  annotations: 10000,
  mistakes: 10000,
  sets: 3000,
}

/** The five synced tables, with the column each one is keyed on per account. */
const TABLES = [
  ['attempts', 'id'],
  ['marks', 'question_id'],
  ['annotations', 'question_id'],
  ['mistakes', 'question_id'],
  ['sets', 'id'],
]

// ---------------------------------------------------------------- http helpers

/** @param {string | null} origin */
function corsHeaders(origin) {
  // Echo the matched origin rather than '*': required the moment this moves to
  // cookies, and harmless now.
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** @param {unknown} body @param {number} status @param {string | null} origin */
function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Sync replies are someone's practice history and /auth returns a
      // session token: nothing here may sit in a browser or proxy cache.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin),
    },
  })
}

/**
 * Parse a JSON body of at most `max` bytes. Checked on the declared length
 * before reading, and again after, since a chunked body declares none.
 * @param {Request} request @param {number} max
 * @returns {Promise<{ tooBig: boolean, body: any }>}
 */
async function readJson(request, max) {
  if (Number(request.headers.get('Content-Length') || 0) > max) return { tooBig: true, body: null }
  const text = await request.text()
  if (text.length > max) return { tooBig: true, body: null }
  try { return { tooBig: false, body: JSON.parse(text) } } catch { return { tooBig: false, body: null } }
}

/**
 * True when `key` is still under `limiter`'s budget. An unbound limiter means
 * no limit, so the file still runs pasted into a dashboard with no bindings.
 * @param {RateLimiter | undefined} limiter @param {string} key
 */
async function allowed(limiter, key) {
  if (!limiter) return true
  const { success } = await limiter.limit({ key })
  return success
}

/** @param {string} message @param {number} status @param {string | null} origin */
function fail(message, status, origin) {
  return json({ error: message }, status, origin)
}

// ---------------------------------------------------------------------- auth

/** @returns {string} 32 random bytes as hex. */
function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * What actually goes in the `sessions` table.
 *
 * The bearer token is handed to the client once and never stored. Only its
 * SHA-256 is kept, so a dump of D1 yields nothing that can be replayed. There
 * is no plaintext fallback on lookup: sessions issued before this change stop
 * matching, so everyone signed in at deploy time is signed out once and signs
 * in again. That costs nobody any data, because every row in every table is
 * keyed on `sub` and the client's IndexedDB is never touched by a 401.
 *
 * SHA-256 hex is 64 characters, which is exactly the width newToken() already
 * produced, so `sessions.token` needs no schema change.
 *
 * @param {string} token
 * @returns {Promise<string>}
 */
async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify a Google ID token and return its subject, or null.
 *
 * Done once per sign-in, not per request, which is why hitting Google's
 * tokeninfo endpoint is fine here and JWKS + WebCrypto would be over-built.
 *
 * The `aud` check is the one that must never be removed. Without it an ID token
 * minted for ANY other Google app authenticates to this one.
 *
 * @param {string} credential
 * @param {string} clientId
 * @returns {Promise<string | null>}
 */
async function verifyGoogleToken(credential, clientId) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
  const res = await fetch(url)
  if (!res.ok) return null

  const info = await res.json()
  if (info.aud !== clientId) return null
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return null
  if (!info.sub) return null
  if (info.exp && Number(info.exp) * 1000 < Date.now()) return null

  // info.email exists here. It is deliberately not read, not stored, not logged.
  return info.sub
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<string | null>}
 */
async function subForRequest(request, env) {
  const header = request.headers.get('Authorization') || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7)
  if (!token) return null

  const hashed = await hashToken(token)
  const row = await env.DB.prepare(
    'SELECT sub, expires_at FROM sessions WHERE token = ?').bind(hashed).first()
  if (!row) return null
  if (row.expires_at * 1000 < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashed).run()
    return null
  }
  return row.sub
}

// ---------------------------------------------------------------- validation

/**
 * Question, attempt and set ids: College Board uuids and ibn codes ("015193-DC"),
 * and our own uuids. Nothing else is a valid key.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/
/** @param {unknown} v @returns {boolean} */
const isStr = (v) => typeof v === 'string' && ID.test(v)
/** @param {unknown} v @returns {boolean} */
const isInt = (v) => typeof v === 'number' && Number.isFinite(v)

const HIGHLIGHT_COLORS = ['yellow', 'blue', 'pink', 'underline']
const MAX_HIGHLIGHTS = 100

/**
 * Drop malformed rows rather than writing junk, and rather than 400-ing the
 * whole request: one bad row must not wedge a client's outbox forever.
 * @param {unknown} raw
 */
function cleanAttempts(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.id) || !isStr(r.question_id) || !isInt(r.answered_at)) continue
    if (!isInt(r.correct)) continue
    out.push({
      id: r.id,
      question_id: r.question_id,
      answered_at: Math.trunc(r.answered_at),
      response: typeof r.response === 'string' ? r.response.slice(0, 200) : null,
      correct: r.correct ? 1 : 0,
      seconds: isInt(r.seconds) ? Math.trunc(r.seconds) : null,
    })
  }
  return out
}

/** @param {unknown} raw */
function cleanMarks(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at)) continue
    out.push({
      question_id: r.question_id,
      flagged: r.flagged ? 1 : 0,
      updated_at: Math.trunc(r.updated_at),
    })
  }
  return out
}

/** @param {unknown} raw */
function cleanMistakes(raw) {
  if (!Array.isArray(raw)) return []
  const allowed = ['process', 'silly', 'knowledge', 'other']
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at)) continue
    // Drop unknown tags rather than storing them. A stale client cannot invent
    // a category the review page has no label for.
    const tags = Array.isArray(r.tags) ? r.tags.filter((t) => allowed.includes(t)) : []
    out.push({
      question_id: r.question_id,
      tags,
      note: typeof r.note === 'string' ? r.note.slice(0, 4000) : null,
      updated_at: Math.trunc(r.updated_at),
    })
  }
  return out
}

/**
 * A practice set. Mutable until it is finished, so it carries updated_at and
 * merges last-write-wins.
 * @param {unknown} raw
 */
function cleanSets(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.id) || !isInt(r.created_at) || !isInt(r.updated_at)) continue
    if (!Array.isArray(r.items)) continue
    // The app makes sets of up to 50; anything past this is not one.
    if (r.items.length > 200) continue
    const items = []
    for (const i of r.items) {
      if (!i || !isStr(i.question_id)) continue
      items.push({
        question_id: i.question_id,
        response: typeof i.response === 'string' ? i.response.slice(0, 200) : null,
        correct: i.correct ? 1 : 0,
        seconds: isInt(i.seconds) ? Math.trunc(i.seconds) : 0,
      })
    }
    const filters = r.filters && typeof r.filters === 'object' ? r.filters : {}
    if (JSON.stringify(filters).length > 2000) continue
    const deleted = r.deleted === true
    out.push({
      id: r.id,
      created_at: Math.trunc(r.created_at),
      // Null is meaningful here: it is what "still active" looks like.
      finished_at: isInt(r.finished_at) ? Math.trunc(r.finished_at) : null,
      updated_at: Math.trunc(r.updated_at),
      seconds: isInt(r.seconds) ? Math.trunc(r.seconds) : 0,
      // A tombstone carries no content: the row only exists to say "gone".
      filters: deleted ? {} : filters,
      items: deleted ? [] : items,
      deleted: deleted ? 1 : 0,
    })
  }
  return out
}

/** @param {unknown} raw */
function cleanAnnotations(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at)) continue
    if (!Array.isArray(r.items) || r.items.length > MAX_HIGHLIGHTS) continue
    // Rebuilt field by field rather than stored as sent, so a row is always a
    // list of highlights and never an arbitrary blob of someone's JSON.
    const items = []
    for (const h of r.items) {
      if (!h || typeof h.field !== 'string' || h.field.length > 40) continue
      if (!isInt(h.start_offset) || !isInt(h.end_offset)) continue
      if (h.start_offset < 0 || h.end_offset < h.start_offset || h.end_offset > 1e6) continue
      if (!HIGHLIGHT_COLORS.includes(h.color)) continue
      items.push({
        id: isInt(h.id) ? Math.trunc(h.id) : items.length + 1,
        field: h.field,
        start_offset: Math.trunc(h.start_offset),
        end_offset: Math.trunc(h.end_offset),
        color: h.color,
        note: typeof h.note === 'string' ? h.note.slice(0, 1000) : null,
      })
    }
    out.push({
      question_id: r.question_id,
      items,
      updated_at: Math.trunc(r.updated_at),
    })
  }
  return out
}

// ---------------------------------------------------------------------- routes

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @returns {Promise<Response>}
 */
async function handleAuth(request, env, origin) {
  // Every call costs a request to Google and, on success, a D1 write, so it is
  // limited per IP like feedback. The IP is only a key and is never stored.
  if (!(await allowed(env.AUTH_LIMITER, request.headers.get('CF-Connecting-IP') || 'unknown'))) {
    return fail('too many sign-in attempts, try again in a minute', 429, origin)
  }
  const { tooBig, body } = await readJson(request, BODY_LIMIT.auth)
  if (tooBig) return fail('request too large', 413, origin)
  // A Google ID token is a JWT of a couple of kilobytes; anything else is junk.
  if (!body || typeof body.credential !== 'string' || body.credential.length > 4096) {
    return fail('missing credential', 400, origin)
  }

  if (!env.GOOGLE_CLIENT_ID) {
    return fail('GOOGLE_CLIENT_ID is not set on the Worker. Check GET /health.', 500, origin)
  }

  const sub = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID)
  if (!sub) return fail('invalid token', 401, origin)

  const allowList = (env.ALLOWED_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowList.length && !allowList.includes(sub)) {
    return fail('this account is not allowed to sign in', 403, origin)
  }
  // No log of the sub here any more: it used to print on every sign-in so the
  // owner could find theirs. `SELECT sub FROM users` in the D1 console does that
  // without writing anyone's account id into the Worker logs.

  const now = Math.floor(Date.now() / 1000)
  const token = newToken()
  // Only the hash is stored. `token` goes back to the caller and is then gone
  // from this side for good.
  const hashed = await hashToken(token)
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO users (sub, created_at) VALUES (?, ?)').bind(sub, now),
    env.DB.prepare(
      'INSERT INTO sessions (token, sub, created_at, expires_at) VALUES (?,?,?,?)',
    ).bind(hashed, sub, now, now + SESSION_DAYS * 86400),
    // Opportunistic cleanup; sessions are the only table that accumulates junk.
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    // And a ceiling per account: without it one valid Google token, replayed
    // for its hour of life, could mint sessions until D1 was full.
    env.DB.prepare(
      'DELETE FROM sessions WHERE sub = ? AND token NOT IN'
      + ' (SELECT token FROM sessions WHERE sub = ? ORDER BY created_at DESC LIMIT ?)',
    ).bind(sub, sub, MAX_SESSIONS),
  ])

  return json({ token }, 200, origin)
}

/**
 * Which of `keys` already exist for this account in `table`. Chunked because D1
 * binds at most 100 parameters per query. Reads only the incoming keys, so its
 * cost follows the size of the request, not the size of the account.
 * @param {Env} env @param {string} sub @param {string} table @param {string} column
 * @param {string[]} keys
 * @returns {Promise<Set<string>>}
 */
async function existingKeys(env, sub, table, column, keys) {
  const found = new Set()
  if (!keys.length) return found
  const statements = []
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90)
    // Table and column come from the TABLES literal, never from the request.
    statements.push(env.DB.prepare(
      `SELECT ${column} AS k FROM ${table} WHERE sub = ? AND ${column} IN (${chunk.map(() => '?').join(',')})`,
    ).bind(sub, ...chunk))
  }
  for (const result of await env.DB.batch(statements)) {
    for (const row of result.results || []) found.add(row.k)
  }
  return found
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @returns {Promise<Response>}
 */
async function handleSync(request, env, origin) {
  const sub = await subForRequest(request, env)
  if (!sub) return fail('not signed in', 401, origin)
  // Per account, so one signed-in user cannot spend the database's daily read
  // and write allowance for everyone else. A real client syncs a few times a
  // minute at most; the client backs off on 429 and nothing is lost.
  if (!(await allowed(env.SYNC_LIMITER, sub))) {
    return fail('syncing too fast, will retry shortly', 429, origin)
  }

  const { tooBig, body } = await readJson(request, BODY_LIMIT.sync)
  if (tooBig) return fail('sync request too large', 413, origin)
  if (!body) return fail('bad body', 400, origin)

  const since = isInt(body.since) ? Math.trunc(body.since) : 0
  const incoming = {
    attempts: cleanAttempts(body.attempts),
    marks: cleanMarks(body.marks),
    annotations: cleanAnnotations(body.annotations),
    mistakes: cleanMistakes(body.mistakes),
    sets: cleanSets(body.sets),
  }

  // Bump the cursor first and read it back, with the stored row counts. D1 has
  // no interactive transactions, so this cannot be folded into the batch below.
  // A refusal or crash after this burns a seq number, which nothing cares about.
  const bumped = await env.DB.prepare(
    'INSERT INTO cursors (sub, seq) VALUES (?, 1)'
    + ' ON CONFLICT(sub) DO UPDATE SET seq = seq + 1'
    + ' RETURNING seq, n_attempts, n_marks, n_annotations, n_mistakes, n_sets',
  ).bind(sub).first()
  const seq = (bumped && bumped.seq) || 1

  // The storage ceilings. These used to COUNT(*) every table on every sync,
  // which reads every row the account has: the most expensive query in the
  // system, and on the free plan a few hundred active users' worth of it would
  // spend the whole day's read allowance. Now the counts live on the cursor row
  // and only the incoming keys are looked up.
  //
  // Refused when what is ALREADY stored is at the ceiling, not when stored +
  // incoming would cross it: re-sent rows (sign-in re-pushes a device's whole
  // history) are not new, and counting them could wedge an account near the
  // ceiling forever. One request can overshoot by at most a batch.
  //
  // The whole request is refused rather than one table dropped, because the
  // client clears its outbox on any 2xx.
  const counts = {}
  for (const [table, column] of TABLES) {
    const rows = incoming[table]
    let stored = bumped ? bumped['n_' + table] : 0
    if (stored === null || stored === undefined) {
      // Never counted (older account, or before this column existed): once.
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM ' + table + ' WHERE sub = ?').bind(sub).first()
      stored = Number((row && row.n) || 0)
    }
    if (rows.length && stored >= CAPS[table]) {
      return fail('storage limit reached for ' + table + ' on this account', 413, origin)
    }
    const keys = rows.map((r) => r[column])
    const have = rows.length ? await existingKeys(env, sub, table, column, keys) : new Set()
    counts[table] = stored + keys.filter((k) => !have.has(k)).length
  }

  const writes = []

  for (const a of incoming.attempts) {
    // Union by (sub, id). An attempt is immutable once written, so IGNORE is
    // the whole merge rule: replaying the same attempt is a no-op.
    writes.push(env.DB.prepare(
      'INSERT OR IGNORE INTO attempts'
      + ' (sub, id, question_id, answered_at, response, correct, seconds, seq)'
      + ' VALUES (?,?,?,?,?,?,?,?)',
    ).bind(sub, a.id, a.question_id, a.answered_at, a.response, a.correct, a.seconds, seq))
  }

  // Last-write-wins, guarded SERVER-side so a client with a wrong clock cannot
  // stomp newer data. The WHERE on the DO UPDATE is what enforces it.
  for (const m of incoming.marks) {
    writes.push(env.DB.prepare(
      'INSERT INTO marks (sub, question_id, flagged, updated_at, seq) VALUES (?,?,?,?,?)'
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   flagged = excluded.flagged, updated_at = excluded.updated_at, seq = excluded.seq'
      + ' WHERE excluded.updated_at > marks.updated_at',
    ).bind(sub, m.question_id, m.flagged, m.updated_at, seq))
  }

  for (const n of incoming.annotations) {
    writes.push(env.DB.prepare(
      'INSERT INTO annotations (sub, question_id, items_json, updated_at, seq)'
      + ' VALUES (?,?,?,?,?)'
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   items_json = excluded.items_json, updated_at = excluded.updated_at,'
      + '   seq = excluded.seq'
      + ' WHERE excluded.updated_at > annotations.updated_at',
    ).bind(sub, n.question_id, JSON.stringify(n.items), n.updated_at, seq))
  }

  for (const m of incoming.mistakes) {
    writes.push(env.DB.prepare(
      'INSERT INTO mistakes (sub, question_id, tags_json, note, updated_at, seq)'
      + ' VALUES (?,?,?,?,?,?)'
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   tags_json = excluded.tags_json, note = excluded.note,'
      + '   updated_at = excluded.updated_at, seq = excluded.seq'
      + ' WHERE excluded.updated_at > mistakes.updated_at',
    ).bind(sub, m.question_id, JSON.stringify(m.tags), m.note, m.updated_at, seq))
  }

  // Last-write-wins, guarded server-side like marks and annotations. A set is
  // worked through over time, so two devices can both hold a version of it.
  // A deletion is just a newer version with `deleted` set, so it wins the same way.
  for (const st of incoming.sets) {
    writes.push(env.DB.prepare(
      'INSERT INTO sets'
      + ' (sub, id, created_at, finished_at, updated_at, seconds, filters_json,'
      + '  items_json, seq, deleted)'
      + ' VALUES (?,?,?,?,?,?,?,?,?,?)'
      + ' ON CONFLICT(sub, id) DO UPDATE SET'
      + '   finished_at = excluded.finished_at, updated_at = excluded.updated_at,'
      + '   seconds = excluded.seconds, filters_json = excluded.filters_json,'
      + '   items_json = excluded.items_json, seq = excluded.seq,'
      + '   deleted = excluded.deleted'
      + ' WHERE excluded.updated_at > sets.updated_at',
    ).bind(sub, st.id, st.created_at, st.finished_at, st.updated_at, st.seconds,
           JSON.stringify(st.filters), JSON.stringify(st.items), seq, st.deleted))
  }

  writes.push(env.DB.prepare(
    'UPDATE cursors SET n_attempts = ?, n_marks = ?, n_annotations = ?, n_mistakes = ?,'
    + ' n_sets = ? WHERE sub = ?',
  ).bind(counts.attempts, counts.marks, counts.annotations, counts.mistakes, counts.sets, sub))

  await env.DB.batch(writes)

  // Deliberately returns the caller's own writes back to it. For the LWW
  // stores that is how the client learns what the server actually decided, so a
  // rejected update self-corrects on the same round trip.
  const [outAttempts, outMarks, outAnnotations, outMistakes, outSets] = await env.DB.batch([
    env.DB.prepare(
      'SELECT id, question_id, answered_at, response, correct, seconds'
      + ' FROM attempts WHERE sub = ? AND seq > ?').bind(sub, since),
    env.DB.prepare(
      'SELECT question_id, flagged, updated_at FROM marks WHERE sub = ? AND seq > ?',
    ).bind(sub, since),
    env.DB.prepare(
      'SELECT question_id, items_json, updated_at FROM annotations WHERE sub = ? AND seq > ?',
    ).bind(sub, since),
    env.DB.prepare(
      'SELECT question_id, tags_json, note, updated_at FROM mistakes WHERE sub = ? AND seq > ?',
    ).bind(sub, since),
    env.DB.prepare(
      'SELECT id, created_at, finished_at, updated_at, seconds, filters_json,'
      + ' items_json, deleted FROM sets WHERE sub = ? AND seq > ?',
    ).bind(sub, since),
  ])

  return json({
    cursor: seq,
    attempts: outAttempts.results || [],
    marks: outMarks.results || [],
    annotations: (outAnnotations.results || []).map((row) => {
      let items = []
      // A row we wrote ourselves, so this should never throw. If the column is
      // ever corrupted, drop that question's highlights rather than 500 the sync.
      try { items = JSON.parse(row.items_json) } catch { items = [] }
      return { question_id: row.question_id, items, updated_at: row.updated_at }
    }),
    mistakes: (outMistakes.results || []).map((row) => {
      let tags = []
      try { tags = JSON.parse(row.tags_json) } catch { tags = [] }
      return {
        question_id: row.question_id, tags, note: row.note, updated_at: row.updated_at,
      }
    }),
    sets: (outSets.results || []).map((row) => {
      let filters = {}
      let items = []
      try { filters = JSON.parse(row.filters_json) } catch { filters = {} }
      try { items = JSON.parse(row.items_json) } catch { items = [] }
      return {
        id: row.id,
        created_at: row.created_at,
        finished_at: row.finished_at,
        updated_at: row.updated_at,
        seconds: row.seconds,
        filters,
        items,
        ...(row.deleted ? { deleted: true } : {}),
      }
    }),
  }, 200, origin)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @returns {Promise<Response>}
 */
async function handleSignOut(request, env, origin) {
  const header = request.headers.get('Authorization') || ''
  if (header.startsWith('Bearer ')) {
    const hashed = await hashToken(header.slice(7))
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashed).run()
  }
  // Always 200: signing out of an already-dead session is not an error, and the
  // client clears its token either way.
  return json({ ok: true }, 200, origin)
}

// ------------------------------------------------------------------ feedback
//
// Bug reports and comments from the site. Anonymous on purpose: no sub, no IP,
// no email is stored, so this table never holds anything that identifies a
// person and account deletion has nothing to do here. Abuse stops are a
// per-IP rate limit (the IP is used as a key and never stored) and a hard cap
// on rows. Only subs listed in ADMIN_SUBS can read or change the inbox.

const FEEDBACK_KINDS = ['bug', 'comment']
const FEEDBACK_MAX_CHARS = 2000
const FEEDBACK_MAX_ROWS = 5000

/** @param {unknown} v @param {number} max */
const optStr = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

/** @param {Request} request @param {Env} env @param {string | null} origin */
async function handleFeedback(request, env, origin) {
  if (!(await allowed(env.FEEDBACK_LIMITER, request.headers.get('CF-Connecting-IP') || 'unknown'))) {
    return fail('too many messages, try again in a minute', 429, origin)
  }
  const { tooBig, body } = await readJson(request, BODY_LIMIT.feedback)
  if (tooBig) return fail('message too large', 413, origin)
  if (!body || typeof body !== 'object') return fail('bad request', 400, origin)
  // Honeypot: a field people never see. Bots that fill every input get a fake
  // success and nothing is written.
  if (body.fax_ref) return json({ ok: true }, 200, origin)

  const kind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : null
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!kind) return fail('kind must be bug or comment', 400, origin)
  if (!message || message.length > FEEDBACK_MAX_CHARS) {
    return fail(`message must be 1-${FEEDBACK_MAX_CHARS} characters`, 400, origin)
  }

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback').first()
  if (count && Number(count.n) >= FEEDBACK_MAX_ROWS) {
    // Make room by dropping the oldest handled messages; refuse only if the
    // inbox is full of open ones.
    const freed = await env.DB.prepare(
      "DELETE FROM feedback WHERE id IN (SELECT id FROM feedback WHERE status = 'done'"
      + ' ORDER BY created_at LIMIT 100)').run()
    if (!freed.meta || !freed.meta.changes) {
      return fail('feedback inbox is full, try again later', 503, origin)
    }
  }

  await env.DB.prepare(
    'INSERT INTO feedback (id, created_at, kind, message, question_id, cb_id, context, status)'
    + " VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
  ).bind(
    crypto.randomUUID(), Math.floor(Date.now() / 1000), kind, message,
    optStr(body.question_id, 80), optStr(body.cb_id, 20), optStr(body.context, 40),
  ).run()
  return json({ ok: true }, 200, origin)
}

// ---------------------------------------------------------------- milestones
//
// How many people use the site, counted without knowing who anyone is. A
// browser sends POST /milestone/1 when it answers its first question and
// /milestone/10 at its tenth different question, once each, ever: it remembers
// that itself (web/src/lib/usage.ts), so nothing here needs an id, a cookie or
// the IP. All that is stored is one total per day per step.
//
// ponytail: anyone can POST here, so a determined script can inflate the count;
// the per-IP limit only slows it. Sanity-check the totals against Web
// Analytics visits. If it ever gets gamed, put Turnstile in front of it.

/** @param {Request} request @param {Env} env @param {string | null} origin @param {number} step */
async function handleMilestone(request, env, origin, step) {
  // The site's fetch is cross-origin, so a browser always sends Origin. One
  // without it is a script, not the site.
  if (!origin) return fail('origin required', 403, origin)
  if (!(await allowed(env.MILESTONE_LIMITER, request.headers.get('CF-Connecting-IP') || 'unknown'))) {
    return fail('too many requests, try again in a minute', 429, origin)
  }
  const day = new Date().toISOString().slice(0, 10)
  await env.DB.prepare(
    'INSERT INTO milestones (day, step, n) VALUES (?, ?, 1)'
    + ' ON CONFLICT(day, step) DO UPDATE SET n = n + 1',
  ).bind(day, step).run()
  return json({ ok: true }, 200, origin)
}

/** @param {Request} request @param {Env} env @param {string | null} origin @param {URL} url */
async function handleAdmin(request, env, origin, url) {
  const sentToken = (request.headers.get('Authorization') || '').startsWith('Bearer ')
  const sub = await subForRequest(request, env)
  // A token that no longer matches a session is a 401, so the client drops it.
  if (sentToken && !sub) return fail('not signed in', 401, origin)
  const admins = (env.ADMIN_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const admin = Boolean(sub && admins.includes(sub))
  if (url.pathname === '/admin/me' && request.method === 'GET') {
    return json({ admin }, 200, origin)
  }
  if (!admin) return fail('not allowed', 403, origin)

  if (url.pathname === '/admin/feedback' && request.method === 'DELETE'
      && url.searchParams.get('status') === 'done') {
    await env.DB.prepare("DELETE FROM feedback WHERE status = 'done'").run()
    return json({ ok: true }, 200, origin)
  }
  if (url.pathname === '/admin/feedback' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, created_at, kind, message, question_id, cb_id, context, status'
      + ' FROM feedback ORDER BY created_at DESC LIMIT 500').all()
    return json({ feedback: results }, 200, origin)
  }
  const m = url.pathname.match(/^\/admin\/feedback\/([0-9a-f-]{36})$/)
  if (m && request.method === 'POST') {
    const { body } = await readJson(request, BODY_LIMIT.admin)
    const status = body && (body.status === 'open' || body.status === 'done') ? body.status : null
    if (!status) return fail('status must be open or done', 400, origin)
    await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, m[1]).run()
    return json({ ok: true }, 200, origin)
  }
  if (m && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(m[1]).run()
    return json({ ok: true }, 200, origin)
  }
  return fail('not found', 404, origin)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @returns {Promise<Response>}
 */
async function handleDelete(request, env, origin) {
  const sub = await subForRequest(request, env)
  if (!sub) return fail('not signed in', 401, origin)

  // Everything, across every table. This is the GDPR/CCPA erasure path and it
  // must leave nothing behind. It does NOT touch the caller's IndexedDB, so
  // deleting cloud data never costs someone their own practice history.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts    WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM marks       WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM annotations WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM mistakes    WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM sets        WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM cursors     WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM sessions    WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM users       WHERE sub = ?').bind(sub),
  ])
  return json({ ok: true }, 200, origin)
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return fail('origin not allowed', 403, origin)
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        // Booleans and the client id only. The client id is public by
        // definition (it ships in the frontend bundle), so echoing it is how
        // you confirm the Worker and the site agree on it. ALLOWED_SUBS is
        // reported as a count, never a value: a sub identifies a person.
        const subs = (env.ALLOWED_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
        return json({
          ok: true,
          d1Bound: Boolean(env.DB),
          googleClientId: env.GOOGLE_CLIENT_ID || null,
          allowedSubsCount: subs.length,
          allowedOrigins: ALLOWED_ORIGINS,
        }, 200, origin)
      }
      if (url.pathname === '/auth/google' && request.method === 'POST') {
        return await handleAuth(request, env, origin)
      }
      if (url.pathname === '/sync' && request.method === 'POST') {
        return await handleSync(request, env, origin)
      }
      if (url.pathname === '/signout' && request.method === 'POST') {
        return await handleSignOut(request, env, origin)
      }
      if (url.pathname === '/me' && request.method === 'DELETE') {
        return await handleDelete(request, env, origin)
      }
      if (url.pathname === '/feedback' && request.method === 'POST') {
        return await handleFeedback(request, env, origin)
      }
      const milestone = url.pathname.match(/^\/milestone\/(1|10)$/)
      if (milestone && request.method === 'POST') {
        return await handleMilestone(request, env, origin, Number(milestone[1]))
      }
      if (url.pathname.startsWith('/admin/')) {
        return await handleAdmin(request, env, origin, url)
      }
      return fail('not found', 404, origin)
    } catch (e) {
      // Log the message only. Never log a request body: annotations are the
      // user's own free text.
      console.error('unhandled', e && e.message)
      return fail('server error', 500, origin)
    }
  },
}
