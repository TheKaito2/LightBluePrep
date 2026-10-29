/**
 * LightBluePrep cloud sync (from Bluebank).
 *
 * Deploy with `cd worker && npx wrangler deploy`, which carries the rate limits,
 * the D1 binding and the logging setting in wrangler.jsonc. A paste into the
 * dashboard's code editor also runs, but without rate limits: wrangler.jsonc is
 * the only place they are bound.
 *
 * Plain JavaScript in one file, with no imports and no build step, so nothing
 * stands between this file and what runs. Editor support comes from
 * worker/jsconfig.json plus worker/types.d.ts, which declare the D1 surface
 * locally, so no @cloudflare/workers-types dependency is needed.
 *
 * Bindings and variables:
 *   DB                D1 database binding, named exactly `DB`
 *   GOOGLE_CLIENT_ID  secret, the OAuth client id ending .apps.googleusercontent.com
 *   GOOGLE_IOS_CLIENT_ID  secret, OPTIONAL. The iOS app's OAuth client; its
 *                     tokens are accepted beside the website's.
 *   ALLOWED_SUBS      secret, OPTIONAL. Comma-separated Google subs. Unset means
 *                     anyone may sign in; setting it makes the site single-user
 *                     again, which is the kill switch.
 *   ADMIN_SUBS        secret. Subs allowed to read the feedback inbox.
 *   DEV_ORIGINS       OPTIONAL. Comma-separated extra origins, for local work
 *                     (`npx wrangler dev --var DEV_ORIGINS:http://localhost:5173`).
 *                     Never set in production, so a page on someone's localhost
 *                     cannot call the live Worker with a visitor's session.
 *   AUTH_LIMITER, SYNC_LIMITER, FEEDBACK_LIMITER, MILESTONE_LIMITER
 *                     rate limit bindings (wrangler.jsonc). An unbound one means
 *                     no limit, which is why /health counts them and the
 *                     watchdog fails when the count is short.
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
 *   feedback_daily  Feedback rows accepted per UTC day, plus one row whose day
 *                is 'total': the inbox size. Both are checked with a guarded
 *                upsert on every message, so no message ever runs a COUNT(*)
 *                over the inbox (see handleFeedback).
 *   idx_feedback_status  Lets the full-inbox cleanup find the oldest handled
 *                messages without reading the open ones.
 *
 * Existing databases: run each file in worker/migrations/ once.
 * ---------------------------------------------------------------------------
 */

/**
 * Exact origins allowed to call this. Scheme + host + port, never a path.
 * Add a custom domain here if the site gets one; that plus the same string in
 * Google's Authorized JavaScript origins is the whole migration. Local origins
 * come from DEV_ORIGINS instead, so production accepts none.
 */
const ALLOWED_ORIGINS = [
  'https://lightblueprep.pages.dev',
]

/** @param {string} origin @param {Env} env */
function originAllowed(origin, env) {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return (env.DEV_ORIGINS || '').split(',').map((s) => s.trim()).includes(origin)
}

const SESSION_DAYS = 90
/** A session used with fewer days than this left is extended (subForRequest). */
const RENEW_DAYS = 30
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
 * question in the bank, which is under 4,000: the 10,000 ceiling is over two
 * full sweeps of every question that exists. Sets are keyed on a uuid and so
 * are unbounded in principle, and a deleted set stays as a tombstone row that
 * still counts, so their ceiling is higher: 20,000 is a dozen sets a day for
 * four years.
 *
 * At a ceiling only NEW rows for that table are turned away (handleSync), and
 * the reply names the table in `refused`. Everything else in the request, and
 * every change to a row already stored, still syncs.
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
  sets: 20000,
}

/**
 * Most rows per table in one sync reply, so one request reads a bounded number
 * of rows however long the history is. It must stay above MAX_ITEMS_PER_REQUEST:
 * one request writes at most that many rows per table, all under one seq, so a
 * full page always spans more than one seq and dropping its last seq group
 * (handleSync) still leaves rows. That is what guarantees each page advances.
 */
const PAGE = 2500

/**
 * The five synced tables with a row per item, and the column each is keyed on
 * per account. The sixth, `study`, is one row per account and handled apart.
 */
const TABLES = [
  ['attempts', 'id'],
  ['marks', 'question_id'],
  ['annotations', 'question_id'],
  ['mistakes', 'question_id'],
  ['sets', 'id'],
]

// ---------------------------------------------------------------- http helpers

/**
 * @param {string | null} origin An origin already checked with originAllowed
 * (the router refuses any other), or null.
 */
function corsHeaders(origin) {
  // Echo the matched origin rather than '*': required the moment this moves to
  // cookies, and harmless now.
  return {
    'Access-Control-Allow-Origin': origin || '',
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
 * before reading, and on the bytes after, since a chunked body declares none.
 * Bytes, not characters: a string's length undercounts anything outside ASCII.
 * `sized` refuses a body with no Content-Length at all, for the endpoint whose
 * limit is large enough that buffering an unchecked body first would matter.
 * @param {Request} request @param {number} max @param {boolean} [sized]
 * @returns {Promise<{ tooBig: boolean, unsized: boolean, body: any }>}
 */
async function readJson(request, max, sized = false) {
  const declared = request.headers.get('Content-Length')
  if (sized && declared === null) return { tooBig: false, unsized: true, body: null }
  if (Number(declared || 0) > max) return { tooBig: true, unsized: false, body: null }
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > max) return { tooBig: true, unsized: false, body: null }
  try {
    return { tooBig: false, unsized: false, body: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { tooBig: false, unsized: false, body: null }
  }
}

/**
 * The rate-limit key for a visitor: the IP, never stored. An IPv6 address is
 * cut to its /64, the block one connection is handed, because a single
 * machine can rotate through the rest of it and get a fresh budget each time.
 * @param {Request} request
 */
function ipKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  // IPv4, or IPv4 written inside IPv6 (::ffff:1.2.3.4): the whole address.
  if (!ip.includes(':') || ip.includes('.')) return ip
  // Expand a `::` to its zero groups so equal prefixes give equal keys.
  const [head, tail] = ip.toLowerCase().split('::')
  let groups = head ? head.split(':') : []
  if (tail !== undefined) {
    const back = tail ? tail.split(':') : []
    groups = [...groups, ...Array(Math.max(0, 8 - groups.length - back.length)).fill('0'), ...back]
  }
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

/**
 * True when `key` is still under `limiter`'s budget. An unbound limiter means
 * no limit, so the file still runs without bindings; /health counts them so
 * the watchdog notices.
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
 * @param {string[]} clientIds Every audience this Worker accepts.
 * @returns {Promise<string | null>}
 */
async function verifyGoogleToken(credential, clientIds) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
  const res = await fetch(url)
  if (!res.ok) return null

  const info = await res.json()
  if (!clientIds.includes(info.aud)) return null
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return null
  if (!info.sub) return null
  if (info.exp && Number(info.exp) * 1000 < Date.now()) return null

  // info.email exists here. It is deliberately not read, not stored, not logged.
  return info.sub
}

/** The iOS app's bundle id: the `aud` of every Sign in with Apple token it gets. */
const APPLE_BUNDLE_ID = 'com.kristpaul.lightblueprep'
const APPLE_ISSUER = 'https://appleid.apple.com'

/** base64url to bytes. */
function b64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/**
 * Verify a Sign in with Apple identity token and return its subject, or null.
 *
 * Apple has no tokeninfo endpoint, so the RS256 signature is checked here with
 * WebCrypto against Apple's published keys (fetched per sign-in, which is rare).
 * Then the claims: issuer, audience (our bundle id; without it a token minted
 * for any other app would work here), expiry, and the nonce, which Apple stores
 * as the SHA-256 hex of the one the app sent.
 * @param {string} credential
 * @param {string} audience
 * @param {string} nonce
 * @param {(url: string) => Promise<Response>} [get] For tests.
 * @returns {Promise<string | null>}
 */
async function verifyAppleToken(credential, audience, nonce, get = fetch) {
  const parts = credential.split('.')
  if (parts.length !== 3) return null
  let header, claims
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])))
    claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])))
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null

  const res = await get('https://appleid.apple.com/auth/keys')
  if (!res.ok) return null
  const { keys } = await res.json()
  const jwk = Array.isArray(keys) ? keys.find((k) => k.kid === header.kid) : null
  if (!jwk) return null
  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  )
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!ok) return null

  if (claims.iss !== APPLE_ISSUER) return null
  if (claims.aud !== audience) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (claims.nonce !== hex) return null
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 200) return null
  // The email (often a private relay address) is not read, stored or logged.
  return claims.sub
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
  const now = Math.floor(Date.now() / 1000)
  if (row.expires_at < now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashed).run()
    return null
  }
  // A session in use slides forward, so someone who practices at least every
  // couple of months is never signed out mid-stride. It renews only inside the
  // last RENEW_DAYS and then jumps to a full SESSION_DAYS, so each session costs
  // one write every 60 days, never one per request.
  if (row.expires_at - now < RENEW_DAYS * 86400) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .bind(now + SESSION_DAYS * 86400, hashed).run()
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

/**
 * Time on one question or one set, in seconds, held to 0..one day. Stats and
 * pacing add these up, so one negative or absurd value would skew them on
 * every device the account syncs to.
 * @param {number} v
 */
const clampSeconds = (v) => Math.min(86400, Math.max(0, Math.trunc(v)))

/**
 * False for a timestamp more than a day past the server clock. answered_at is
 * in seconds and updated_at in milliseconds (web/src/lib/store.ts). A future
 * updated_at would win every last-write-wins comparison until that date, so
 * such a row is dropped like any other malformed one; a day of slack covers
 * any honest clock.
 */
const DAY = 86400
/** @param {number} sec */
const notFutureSec = (sec) => sec <= Math.floor(Date.now() / 1000) + DAY
/** @param {number} ms */
const notFutureMs = (ms) => ms <= Date.now() + DAY * 1000

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
    if (!isInt(r.correct) || !notFutureSec(r.answered_at)) continue
    out.push({
      id: r.id,
      question_id: r.question_id,
      answered_at: Math.trunc(r.answered_at),
      response: typeof r.response === 'string' ? r.response.slice(0, 200) : null,
      correct: r.correct ? 1 : 0,
      seconds: isInt(r.seconds) ? clampSeconds(r.seconds) : null,
    })
  }
  return out
}

/** @param {unknown} raw */
function cleanMarks(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at) || !notFutureMs(r.updated_at)) continue
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
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at) || !notFutureMs(r.updated_at)) continue
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
function cleanSets(raw, oversize = []) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.id) || !isInt(r.created_at) || !isInt(r.updated_at)) continue
    if (!notFutureMs(r.updated_at)) continue
    if (!Array.isArray(r.items)) continue
    // The app makes sets of up to 50; anything past this is not one.
    if (r.items.length > 200) { oversize.push('sets'); continue }
    const items = []
    for (const i of r.items) {
      if (!i || !isStr(i.question_id)) continue
      items.push({
        question_id: i.question_id,
        response: typeof i.response === 'string' ? i.response.slice(0, 200) : null,
        correct: i.correct ? 1 : 0,
        seconds: isInt(i.seconds) ? clampSeconds(i.seconds) : 0,
      })
    }
    const filters = r.filters && typeof r.filters === 'object' ? r.filters : {}
    // Every skill plus every question type ticked is about 7 KB.
    if (JSON.stringify(filters).length > 16 * 1024) { oversize.push('sets'); continue }
    const deleted = r.deleted === true
    out.push({
      id: r.id,
      created_at: Math.trunc(r.created_at),
      // Null is meaningful here: it is what "still active" looks like.
      finished_at: isInt(r.finished_at) ? Math.trunc(r.finished_at) : null,
      updated_at: Math.trunc(r.updated_at),
      seconds: isInt(r.seconds) ? clampSeconds(r.seconds) : 0,
      // A tombstone carries no content: the row only exists to say "gone".
      filters: deleted ? {} : filters,
      items: deleted ? [] : items,
      deleted: deleted ? 1 : 0,
    })
  }
  return out
}

/** Largest study row (goal + plan) accepted, as JSON. A year of daily sessions is about 60 KB. */
const MAX_STUDY_BYTES = 128 * 1024
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The study row: the goal and the plan, one per account, last write wins. The
 * client owns its shape; this keeps it an object of bounded size whose plan,
 * if any, is a list of dated sessions, so a row is always something the app
 * can read back.
 * @param {unknown} raw
 */
function cleanStudy(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  if (!isInt(r.updated_at) || !notFutureMs(r.updated_at)) return null
  const goal = r.goal && typeof r.goal === 'object' ? r.goal : null
  let plan = null
  if (r.plan && typeof r.plan === 'object') {
    const p = /** @type {Record<string, unknown>} */ (r.plan)
    if (typeof p.test_date !== 'string' || !DATE.test(p.test_date)) return null
    if (!Array.isArray(p.sessions) || p.sessions.length > 1000) return null
    for (const x of p.sessions) {
      if (!x || typeof x !== 'object' || typeof x.date !== 'string' || !DATE.test(x.date)) return null
    }
    plan = p
  }
  const json = JSON.stringify({ goal, plan })
  if (json.length > MAX_STUDY_BYTES) return null
  return { json, updated_at: Math.trunc(r.updated_at) }
}

/** @param {unknown} raw */
function cleanAnnotations(raw, oversize = []) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const r of raw.slice(0, MAX_ITEMS_PER_REQUEST)) {
    if (!r || !isStr(r.question_id) || !isInt(r.updated_at) || !notFutureMs(r.updated_at)) continue
    if (!Array.isArray(r.items)) continue
    if (r.items.length > MAX_HIGHLIGHTS) { oversize.push('annotations'); continue }
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
async function handleAuth(request, env, origin, provider = 'google') {
  // Every call costs a request to Google or Apple and, on success, a D1 write,
  // so it is limited per IP like feedback. The IP is only a key and is never stored.
  if (!(await allowed(env.AUTH_LIMITER, ipKey(request)))) {
    return fail('Too many sign-in attempts. Try again in a minute.', 429, origin)
  }
  const { tooBig, body } = await readJson(request, BODY_LIMIT.auth)
  if (tooBig) return fail('Request too large.', 413, origin)
  // An ID token is a JWT of a couple of kilobytes; anything else is junk.
  if (!body || typeof body.credential !== 'string' || body.credential.length > 4096) {
    return fail('Missing sign-in credential.', 400, origin)
  }

  let sub = null
  if (provider === 'apple') {
    // Apple's subs live under a prefix, so one can never equal a Google sub.
    // The nonce is the iOS app's, hashed into the token by Apple: it ties the
    // token to the one sign-in the app started.
    if (typeof body.nonce !== 'string' || body.nonce.length < 16 || body.nonce.length > 128) {
      return fail('Missing sign-in nonce.', 400, origin)
    }
    const appleSub = await verifyAppleToken(body.credential, APPLE_BUNDLE_ID, body.nonce)
    sub = appleSub ? `apple:${appleSub}` : null
  } else {
    if (!env.GOOGLE_CLIENT_ID) {
      // The detail is for the owner's logs; a student only needs to know it is down.
      console.error('GOOGLE_CLIENT_ID is not set on the Worker. Check GET /health.')
      return fail('Sign-in is temporarily unavailable.', 500, origin)
    }
    // The website's client, and the iOS app's once GOOGLE_IOS_CLIENT_ID is set.
    const audiences = [env.GOOGLE_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter(Boolean)
    sub = await verifyGoogleToken(body.credential, audiences)
  }
  if (!sub) return fail('Sign-in failed. Try again.', 401, origin)

  const allowList = (env.ALLOWED_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowList.length && !allowList.includes(sub)) {
    return fail('This account is not allowed to sign in.', 403, origin)
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
  if (!sub) return fail('Not signed in.', 401, origin)
  // Per account, so one signed-in user cannot spend the database's daily read
  // and write allowance for everyone else. A real client syncs a few times a
  // minute at most; the client backs off on 429 and nothing is lost.
  if (!(await allowed(env.SYNC_LIMITER, sub))) {
    return fail('Syncing too fast. Will retry shortly.', 429, origin)
  }

  // Sized: up to 4 MB is allowed here, so the declared length is checked
  // before anything is buffered. Browsers always declare it for a string body.
  const { tooBig, unsized, body } = await readJson(request, BODY_LIMIT.sync, true)
  if (unsized) return fail('Content-Length required.', 411, origin)
  if (tooBig) return fail('Sync request too large.', 413, origin)
  if (!body) return fail('Bad request.', 400, origin)

  let since = isInt(body.since) ? Math.trunc(body.since) : 0
  // Rows dropped for size, not shape: their tables go in `refused`, so the
  // client keeps them queued and says why instead of clearing them as synced.
  /** @type {string[]} */
  const oversize = []
  const incoming = {
    attempts: cleanAttempts(body.attempts),
    marks: cleanMarks(body.marks),
    annotations: cleanAnnotations(body.annotations, oversize),
    mistakes: cleanMistakes(body.mistakes),
    sets: cleanSets(body.sets, oversize),
  }
  const study = cleanStudy(body.study)
  // Sent but not storable (too big or malformed): say so, so the client keeps
  // it queued and shows why, rather than clearing it as if it had synced.

  // The stored row counts, for the ceilings, and the current seq. Read apart
  // from the batch below, so it can be a moment stale when two devices sync at
  // once; the ceilings are abuse stops rather than exact quotas, and nothing
  // the batch does depends on this read.
  const current = await env.DB.prepare(
    'SELECT seq, n_attempts, n_marks, n_annotations, n_mistakes, n_sets'
    + ' FROM cursors WHERE sub = ?',
  ).bind(sub).first()

  // A client cursor at or past the seq this request is about to take cannot
  // have come from this account as it stands: the account was deleted and made
  // again, or another Google account signed in on that device. Pulling from it
  // would skip every row at or below it for good, so pull everything instead.
  if (since > ((current && current.seq) || 0)) since = 0

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
  // At the ceiling only that table's new rows are dropped, and the table is
  // named in `refused` so the client keeps those changes queued. Refusing the
  // whole request (a 413, as this once did) stopped every other change from
  // syncing too, with nothing the student could do about it.
  const counts = {}
  /** @type {string[]} */
  const refused = []
  for (const [table, column] of TABLES) {
    const rows = incoming[table]
    let stored = current ? current['n_' + table] : null
    if (stored === null || stored === undefined) {
      // Never counted (new or older account, or before this column existed): once.
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM ' + table + ' WHERE sub = ?').bind(sub).first()
      stored = Number((row && row.n) || 0)
    }
    const have = rows.length
      ? await existingKeys(env, sub, table, column, rows.map((r) => r[column]))
      : new Set()
    let added = rows.filter((r) => !have.has(r[column])).length
    if (added && stored >= CAPS[table]) {
      incoming[table] = rows.filter((r) => have.has(r[column]))
      refused.push(table)
      added = 0
    }
    counts[table] = stored + added
  }

  // ONE batch, which D1 runs as a single transaction, and D1 runs one at a time
  // per database. So the seq this request takes, the rows written under it and
  // the rows read back are one atomic step. They used to be three round trips,
  // and a second device's request could take seq 5, lose the race to write, and
  // commit its rows after this one had already read up to seq 6: rows this
  // device then never asked for again.
  //
  // Every write is guarded on the user row. A delete-my-data that lands while a
  // sync is in flight removes the user first, and without the guard the sync's
  // writes recreated rows that nothing could reach or delete again.
  const live = ' WHERE EXISTS (SELECT 1 FROM users WHERE sub = ?)'
  const seqOf = '(SELECT seq FROM cursors WHERE sub = ?)'
  const batch = [
    env.DB.prepare(
      'INSERT INTO cursors (sub, seq) SELECT ?, 1' + live
      + ' ON CONFLICT(sub) DO UPDATE SET seq = seq + 1',
    ).bind(sub, sub),
  ]

  for (const a of incoming.attempts) {
    // Union by (sub, id). An attempt is immutable once written, so IGNORE is
    // the whole merge rule: replaying the same attempt is a no-op.
    batch.push(env.DB.prepare(
      'INSERT OR IGNORE INTO attempts'
      + ' (sub, id, question_id, answered_at, response, correct, seconds, seq)'
      + ' SELECT ?,?,?,?,?,?,?,' + seqOf + live,
    ).bind(sub, a.id, a.question_id, a.answered_at, a.response, a.correct, a.seconds, sub, sub))
  }

  // Last-write-wins, guarded SERVER-side so a client with a wrong clock cannot
  // stomp newer data. The WHERE on the DO UPDATE is what enforces it.
  for (const m of incoming.marks) {
    batch.push(env.DB.prepare(
      'INSERT INTO marks (sub, question_id, flagged, updated_at, seq)'
      + ' SELECT ?,?,?,?,' + seqOf + live
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   flagged = excluded.flagged, updated_at = excluded.updated_at, seq = excluded.seq'
      + ' WHERE excluded.updated_at > marks.updated_at',
    ).bind(sub, m.question_id, m.flagged, m.updated_at, sub, sub))
  }

  for (const n of incoming.annotations) {
    batch.push(env.DB.prepare(
      'INSERT INTO annotations (sub, question_id, items_json, updated_at, seq)'
      + ' SELECT ?,?,?,?,' + seqOf + live
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   items_json = excluded.items_json, updated_at = excluded.updated_at,'
      + '   seq = excluded.seq'
      + ' WHERE excluded.updated_at > annotations.updated_at',
    ).bind(sub, n.question_id, JSON.stringify(n.items), n.updated_at, sub, sub))
  }

  for (const m of incoming.mistakes) {
    batch.push(env.DB.prepare(
      'INSERT INTO mistakes (sub, question_id, tags_json, note, updated_at, seq)'
      + ' SELECT ?,?,?,?,?,' + seqOf + live
      + ' ON CONFLICT(sub, question_id) DO UPDATE SET'
      + '   tags_json = excluded.tags_json, note = excluded.note,'
      + '   updated_at = excluded.updated_at, seq = excluded.seq'
      + ' WHERE excluded.updated_at > mistakes.updated_at',
    ).bind(sub, m.question_id, JSON.stringify(m.tags), m.note, m.updated_at, sub, sub))
  }

  // Last-write-wins, guarded server-side like marks and annotations. A set is
  // worked through over time, so two devices can both hold a version of it.
  // A deletion is just a newer version with `deleted` set, so it wins the same way.
  for (const st of incoming.sets) {
    batch.push(env.DB.prepare(
      'INSERT INTO sets'
      + ' (sub, id, created_at, finished_at, updated_at, seconds, filters_json,'
      + '  items_json, seq, deleted)'
      + ' SELECT ?,?,?,?,?,?,?,?,' + seqOf + ',?' + live
      + ' ON CONFLICT(sub, id) DO UPDATE SET'
      + '   finished_at = excluded.finished_at, updated_at = excluded.updated_at,'
      + '   seconds = excluded.seconds, filters_json = excluded.filters_json,'
      + '   items_json = excluded.items_json, seq = excluded.seq,'
      + '   deleted = excluded.deleted'
      + ' WHERE excluded.updated_at > sets.updated_at',
    ).bind(sub, st.id, st.created_at, st.finished_at, st.updated_at, st.seconds,
           JSON.stringify(st.filters), JSON.stringify(st.items), sub, st.deleted, sub))
  }

  // The goal and plan: one row per account, last write wins like a set.
  if (study) {
    batch.push(env.DB.prepare(
      'INSERT INTO study (sub, json, updated_at, seq)'
      + ' SELECT ?,?,?,' + seqOf + live
      + ' ON CONFLICT(sub) DO UPDATE SET'
      + '   json = excluded.json, updated_at = excluded.updated_at, seq = excluded.seq'
      + ' WHERE excluded.updated_at > study.updated_at',
    ).bind(sub, study.json, study.updated_at, sub, sub))
  }

  batch.push(env.DB.prepare(
    'UPDATE cursors SET n_attempts = ?, n_marks = ?, n_annotations = ?, n_mistakes = ?,'
    + ' n_sets = ? WHERE sub = ?',
  ).bind(counts.attempts, counts.marks, counts.annotations, counts.mistakes, counts.sets, sub))

  // The pull, in seq order and a page at a time. It returns this request's own
  // accepted writes too, since they carry the new seq; for the LWW stores that
  // is how the client learns the stored value. A REJECTED write is not echoed:
  // its row keeps the seq it had. That is safe because clients stamp an edit
  // past the version they hold (web/src/lib/store.ts), so an edit loses only to
  // a later write from another device, and that row has a seq above the
  // client's cursor and comes back in this pull or the next page.
  /** @param {string} columns @param {string} table */
  const page = (columns, table) => env.DB.prepare(
    `SELECT ${columns}, seq FROM ${table} WHERE sub = ? AND seq > ? ORDER BY seq LIMIT ${PAGE}`,
  ).bind(sub, since)
  batch.push(
    page('id, question_id, answered_at, response, correct, seconds', 'attempts'),
    page('question_id, flagged, updated_at', 'marks'),
    page('question_id, items_json, updated_at', 'annotations'),
    page('question_id, tags_json, note, updated_at', 'mistakes'),
    page('id, created_at, finished_at, updated_at, seconds, filters_json, items_json, deleted', 'sets'),
    env.DB.prepare('SELECT json, updated_at FROM study WHERE sub = ? AND seq > ?').bind(sub, since),
    env.DB.prepare('SELECT seq FROM cursors WHERE sub = ?').bind(sub),
  )

  if (body.study && !study) refused.push('study')
  for (const t of oversize) if (!refused.includes(t)) refused.push(t)

  const results = await env.DB.batch(batch)
  const pages = results.slice(-7, -2)
  const studyRow = (results[results.length - 2].results || [])[0]
  const head = (results[results.length - 1].results || [])[0]
  // No cursor row means no user row: the account was deleted while this was in
  // flight, so every write above was a no-op and the session is gone too.
  if (!head) return fail('Not signed in.', 401, origin)

  // A full page may end partway through a seq group, so its last group is held
  // back for the next page and the cursor stops just below it. Tables that were
  // not full may then repeat a few rows next time, which applying is a no-op for.
  let cursor = head.seq
  let more = false
  const [outAttempts, outMarks, outAnnotations, outMistakes, outSets] = pages.map((r) => {
    const rows = r.results || []
    if (rows.length < PAGE) return rows
    more = true
    const last = rows[rows.length - 1].seq
    cursor = Math.min(cursor, last - 1)
    return rows.filter((row) => row.seq < last)
  })

  /** @type {{ goal: unknown, plan: unknown, updated_at: number } | null} */
  let studyOut = null
  if (studyRow) {
    // A row we wrote ourselves; if it is ever unreadable, send nothing rather than 500.
    try { studyOut = { ...JSON.parse(studyRow.json), updated_at: studyRow.updated_at } } catch { studyOut = null }
  }

  return json({
    cursor,
    more,
    refused,
    study: studyOut,
    attempts: outAttempts.map((row) => ({
      id: row.id,
      question_id: row.question_id,
      answered_at: row.answered_at,
      response: row.response,
      correct: row.correct,
      seconds: row.seconds,
    })),
    marks: outMarks.map((row) => ({
      question_id: row.question_id, flagged: row.flagged, updated_at: row.updated_at,
    })),
    annotations: outAnnotations.map((row) => {
      let items = []
      // A row we wrote ourselves, so this should never throw. If the column is
      // ever corrupted, drop that question's highlights rather than 500 the sync.
      try { items = JSON.parse(row.items_json) } catch { items = [] }
      return { question_id: row.question_id, items, updated_at: row.updated_at }
    }),
    mistakes: outMistakes.map((row) => {
      let tags = []
      try { tags = JSON.parse(row.tags_json) } catch { tags = [] }
      return {
        question_id: row.question_id, tags, note: row.note, updated_at: row.updated_at,
      }
    }),
    sets: outSets.map((row) => {
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
 * Ends this session, or with ?all=1 every session of the same account: the way
 * to cut off a device that is lost or a token that leaked, short of deleting
 * the account's data.
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function handleSignOut(request, env, origin, url) {
  const header = request.headers.get('Authorization') || ''
  if (header.startsWith('Bearer ')) {
    const hashed = await hashToken(header.slice(7))
    if (url.searchParams.get('all') === '1') {
      // An unknown token matches no sub, so this deletes nothing.
      await env.DB.prepare(
        'DELETE FROM sessions WHERE sub = (SELECT sub FROM sessions WHERE token = ?)',
      ).bind(hashed).run()
    } else {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashed).run()
    }
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
// per-IP rate limit (the IP is used as a key and never stored), a ceiling per
// UTC day and a ceiling on the inbox. Only subs listed in ADMIN_SUBS can read
// or change the inbox.
//
// Both ceilings are counter rows in feedback_daily, raised by an upsert that
// refuses at the ceiling. They used to be a COUNT(*) over the inbox on every
// message: up to 5,000 rows read per POST, which a script rotating addresses
// could turn into the whole free plan's daily read allowance, and then sync
// and sign-in failed for everyone until midnight UTC. Now a message reads a
// couple of rows whatever the inbox holds.

const FEEDBACK_KINDS = ['bug', 'comment']
const FEEDBACK_MAX_CHARS = 2000
const FEEDBACK_MAX_ROWS = 5000
/** Far above any real day's messages, far below what fills the inbox. */
const FEEDBACK_PER_DAY = 300
/** The feedback_daily row that holds the inbox size rather than a day's count. */
const FEEDBACK_TOTAL = 'total'

/** @param {unknown} v @param {number} max */
const optStr = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

/**
 * Count one more message against `key` if it is under `max`. Null means the
 * ceiling is reached and nothing changed.
 * @param {Env} env @param {string} key @param {number} max
 */
const bumpFeedbackCounter = (env, key, max) => env.DB.prepare(
  'INSERT INTO feedback_daily (day, n) VALUES (?, 1)'
  + ' ON CONFLICT(day) DO UPDATE SET n = n + 1 WHERE n < ? RETURNING n',
).bind(key, max).first()

/**
 * Bring the inbox-size counter back to the true count. Only the owner's
 * deletes call this, a few times a week at most, so the COUNT(*) is affordable
 * here, and it also heals any drift (a message whose INSERT failed after its
 * count went up).
 * @param {Env} env
 */
const recountFeedback = (env) => env.DB.prepare(
  'INSERT INTO feedback_daily (day, n) SELECT ?, COUNT(*) FROM feedback WHERE 1'
  + ' ON CONFLICT(day) DO UPDATE SET n = excluded.n',
).bind(FEEDBACK_TOTAL)

/** @param {Request} request @param {Env} env @param {string | null} origin */
async function handleFeedback(request, env, origin) {
  if (!(await allowed(env.FEEDBACK_LIMITER, ipKey(request)))) {
    return fail('Too many messages. Try again in a minute.', 429, origin)
  }
  const { tooBig, body } = await readJson(request, BODY_LIMIT.feedback)
  if (tooBig) return fail('Message too large.', 413, origin)
  if (!body || typeof body !== 'object') return fail('Bad request.', 400, origin)
  // Honeypot: a field people never see. Bots that fill every input get a fake
  // success and nothing is written.
  if (body.fax_ref) return json({ ok: true }, 200, origin)

  const kind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : null
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!kind) return fail('Kind must be bug or comment.', 400, origin)
  if (!message || message.length > FEEDBACK_MAX_CHARS) {
    return fail(`Message must be 1 to ${FEEDBACK_MAX_CHARS} characters.`, 400, origin)
  }

  const day = new Date().toISOString().slice(0, 10)
  if (!(await bumpFeedbackCounter(env, day, FEEDBACK_PER_DAY))) {
    return fail('Feedback is full for today. Try again tomorrow.', 429, origin)
  }
  if (!(await bumpFeedbackCounter(env, FEEDBACK_TOTAL, FEEDBACK_MAX_ROWS))) {
    // Make room by dropping the oldest handled messages; refuse only if the
    // inbox is full of open ones. idx_feedback_status keeps this to the rows
    // it deletes, so a flood against a full inbox reads next to nothing.
    const freed = await env.DB.prepare(
      "DELETE FROM feedback WHERE id IN (SELECT id FROM feedback WHERE status = 'done'"
      + ' ORDER BY created_at LIMIT 100)').run()
    const changes = (freed.meta && freed.meta.changes) || 0
    if (changes) {
      await env.DB.prepare('UPDATE feedback_daily SET n = MAX(0, n - ?) WHERE day = ?')
        .bind(changes, FEEDBACK_TOTAL).run()
    }
    if (!changes || !(await bumpFeedbackCounter(env, FEEDBACK_TOTAL, FEEDBACK_MAX_ROWS))) {
      return fail('The feedback inbox is full. Try again later.', 503, origin)
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
//
// What a script cannot do is spend the database's write allowance: each step
// stops counting at MILESTONE_DAY_CAP a day, and from there a POST writes
// nothing. The inbox shows "capped" when a day hits it, since that day's
// number is then a floor rather than a count.

/**
 * Far above a real day's new browsers. Two steps at this cap are a tenth of the
 * free plan's 100,000 daily writes.
 */
const MILESTONE_DAY_CAP = 5000

/** @param {Request} request @param {Env} env @param {string | null} origin @param {number} step */
async function handleMilestone(request, env, origin, step) {
  // The site's fetch is cross-origin, so a browser always sends Origin. One
  // without it is a script, not the site.
  if (!origin) return fail('Origin required.', 403, origin)
  if (!(await allowed(env.MILESTONE_LIMITER, ipKey(request)))) {
    return fail('Too many requests. Try again in a minute.', 429, origin)
  }
  const day = new Date().toISOString().slice(0, 10)
  // Still a 200 at the cap: the browser has nothing to retry or report.
  await env.DB.prepare(
    'INSERT INTO milestones (day, step, n) VALUES (?, ?, 1)'
    + ' ON CONFLICT(day, step) DO UPDATE SET n = n + 1 WHERE n < ?',
  ).bind(day, step, MILESTONE_DAY_CAP).run()
  return json({ ok: true }, 200, origin)
}

/** @param {Request} request @param {Env} env @param {string | null} origin @param {URL} url */
async function handleAdmin(request, env, origin, url) {
  const sentToken = (request.headers.get('Authorization') || '').startsWith('Bearer ')
  const sub = await subForRequest(request, env)
  // A token that no longer matches a session is a 401, so the client drops it.
  if (sentToken && !sub) return fail('Not signed in.', 401, origin)
  const admins = (env.ADMIN_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const admin = Boolean(sub && admins.includes(sub))
  if (url.pathname === '/admin/me' && request.method === 'GET') {
    return json({ admin }, 200, origin)
  }
  if (!admin) return fail('Not allowed.', 403, origin)

  if (url.pathname === '/admin/feedback' && request.method === 'DELETE') {
    const status = url.searchParams.get('status')
    const since = Number(url.searchParams.get('since'))
    let purge
    if (status === 'done') {
      purge = env.DB.prepare("DELETE FROM feedback WHERE status = 'done'")
    } else if (status === 'open' && Number.isInteger(since) && since > 0) {
      // Spam cleanup: a flood arrives together, so "every open message since
      // the first junk one" takes it out without touching older real ones.
      purge = env.DB.prepare("DELETE FROM feedback WHERE status = 'open' AND created_at >= ?").bind(since)
    } else {
      return fail('Status must be done, or open with since.', 400, origin)
    }
    await env.DB.batch([purge, recountFeedback(env)])
    return json({ ok: true }, 200, origin)
  }
  if (url.pathname === '/admin/stats' && request.method === 'GET') {
    // The usage scoreboard for the inbox: totals only, nothing per person.
    // `capped` is 1 when a step hit MILESTONE_DAY_CAP today, so today's
    // figures stopped counting.
    const today = new Date().toISOString().slice(0, 10)
    const stats = await env.DB.prepare(
      'SELECT'
      + ' (SELECT COALESCE(SUM(n), 0) FROM milestones WHERE step = 1) AS tried,'
      + ' (SELECT COALESCE(SUM(n), 0) FROM milestones WHERE step = 10) AS used,'
      + ' (SELECT COALESCE(SUM(n), 0) FROM milestones WHERE step = 1 AND day = ?) AS tried_today,'
      + ' (SELECT COUNT(*) FROM milestones WHERE day = ? AND n >= ?) AS capped,'
      + ' (SELECT COUNT(*) FROM users) AS accounts',
    ).bind(today, today, MILESTONE_DAY_CAP).first()
    return json({ ...stats, capped: Boolean(stats && stats.capped) }, 200, origin)
  }
  if (url.pathname === '/admin/feedback' && request.method === 'GET') {
    // A page of 500, newest first. `before` is the created_at of the oldest
    // message the inbox already has; <= rather than < so messages sharing that
    // second are not skipped, and the inbox drops the ones it already holds.
    const before = Number(url.searchParams.get('before'))
    const paged = Number.isInteger(before) && before > 0
    const [page, counts] = await env.DB.batch([
      env.DB.prepare(
        'SELECT id, created_at, kind, message, question_id, cb_id, context, status'
        + ' FROM feedback' + (paged ? ' WHERE created_at <= ?' : '')
        + ' ORDER BY created_at DESC LIMIT 500',
      ).bind(...(paged ? [before] : [])),
      env.DB.prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'open'), 0) AS open FROM feedback"),
    ])
    const totals = (counts.results || [])[0] || { total: 0, open: 0 }
    return json({ feedback: page.results || [], total: totals.total, open: totals.open }, 200, origin)
  }
  const m = url.pathname.match(/^\/admin\/feedback\/([0-9a-f-]{36})$/)
  if (m && request.method === 'POST') {
    const { body } = await readJson(request, BODY_LIMIT.admin)
    const status = body && (body.status === 'open' || body.status === 'done') ? body.status : null
    if (!status) return fail('Status must be open or done.', 400, origin)
    await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, m[1]).run()
    return json({ ok: true }, 200, origin)
  }
  if (m && request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(m[1]),
      recountFeedback(env),
    ])
    return json({ ok: true }, 200, origin)
  }
  return fail('Not found.', 404, origin)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string | null} origin
 * @returns {Promise<Response>}
 */
async function handleDelete(request, env, origin) {
  const sub = await subForRequest(request, env)
  if (!sub) return fail('Not signed in.', 401, origin)

  // Everything, across every table. This is the GDPR/CCPA erasure path and it
  // must leave nothing behind. It does NOT touch the caller's IndexedDB, so
  // deleting cloud data never costs someone their own practice history.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts    WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM marks       WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM annotations WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM mistakes    WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM sets        WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM study       WHERE sub = ?').bind(sub),
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
    const sent = request.headers.get('Origin')
    // From here on `origin` is either null or one this Worker accepts, so
    // every reply can echo it in CORS without checking again.
    const origin = sent && originAllowed(sent, env) ? sent : null
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (sent && !origin) {
      return fail('Origin not allowed.', 403, null)
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        // Booleans, counts and the client id only. The client id is public by
        // definition (it ships in the frontend bundle), so echoing it is how
        // you confirm the Worker and the site agree on it. ALLOWED_SUBS is
        // reported as a count, never a value: a sub identifies a person.
        //
        // `limiters` and `d1Ok` are what the watchdog checks. An unbound
        // limiter is no limit at all, which nothing else would notice, and a
        // bound database can still be unreachable.
        const subs = (env.ALLOWED_SUBS || '').split(',').map((s) => s.trim()).filter(Boolean)
        const limiters = [env.AUTH_LIMITER, env.SYNC_LIMITER, env.FEEDBACK_LIMITER, env.MILESTONE_LIMITER]
          .filter(Boolean).length
        let d1Ok = false
        try {
          d1Ok = Boolean(env.DB && await env.DB.prepare('SELECT 1 AS ok').first())
        } catch (e) {
          console.error('health: D1 query failed', e && e.message)
        }
        return json({
          ok: true,
          d1Bound: Boolean(env.DB),
          d1Ok,
          limiters,
          googleClientId: env.GOOGLE_CLIENT_ID || null,
          googleIosClientId: env.GOOGLE_IOS_CLIENT_ID || null,
          allowedSubsCount: subs.length,
        }, 200, origin)
      }
      if (url.pathname === '/auth/google' && request.method === 'POST') {
        return await handleAuth(request, env, origin)
      }
      if (url.pathname === '/auth/apple' && request.method === 'POST') {
        return await handleAuth(request, env, origin, 'apple')
      }
      if (url.pathname === '/sync' && request.method === 'POST') {
        return await handleSync(request, env, origin)
      }
      if (url.pathname === '/signout' && request.method === 'POST') {
        return await handleSignOut(request, env, origin, url)
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
      return fail('Not found.', 404, origin)
    } catch (e) {
      // Log the message only. Never log a request body: annotations are the
      // user's own free text.
      console.error('unhandled', e && e.message)
      return fail('Server error.', 500, origin)
    }
  },
}

// For worker/test only; nothing routes to them. Functions and nothing else:
// workerd treats every named export of the main module as a possible
// entrypoint and refuses to start on one that is a number, string or array.
export { cleanAttempts, cleanMarks, cleanAnnotations, cleanMistakes, cleanSets, existingKeys, verifyAppleToken }
