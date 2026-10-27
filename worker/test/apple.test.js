import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyAppleToken } from '../src/index.js'

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const sha = async (s) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex')

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' }
const keys = async () => new Response(JSON.stringify({ keys: [jwk] }))

async function token(claims, { kid = 'k1', key = pair.privateKey } = {}) {
  const head = enc({ alg: 'RS256', kid })
  const body = enc(claims)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`
}

const NONCE = 'a-random-nonce-of-some-length'
const good = async (over = {}) => ({
  iss: 'https://appleid.apple.com', aud: 'com.kristpaul.lightblueprep', sub: '001234.abc',
  exp: Math.floor(Date.now() / 1000) + 600, nonce: await sha(NONCE), ...over,
})

test('accepts a token Apple signed for this app and nonce', async () => {
  assert.equal(await verifyAppleToken(await token(await good()), 'com.kristpaul.lightblueprep', NONCE, keys), '001234.abc')
})

test('rejects a wrong audience, issuer, nonce, expiry, key or signature', async () => {
  const aud = 'com.kristpaul.lightblueprep'
  const v = (t, n = NONCE) => verifyAppleToken(t, aud, n, keys)
  assert.equal(await v(await token(await good({ aud: 'com.someone.else' }))), null)
  assert.equal(await v(await token(await good({ iss: 'https://evil.example' }))), null)
  assert.equal(await v(await token(await good()), 'a-different-nonce-entirely'), null)
  assert.equal(await v(await token(await good({ exp: 1 }))), null)
  assert.equal(await v(await token(await good(), { kid: 'unknown' })), null)
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'])
  assert.equal(await v(await token(await good(), { key: other.privateKey })), null)
  const t = await token(await good())
  const [h, , s] = t.split('.')
  assert.equal(await v(`${h}.${enc(await good({ sub: 'someone-else' }))}.${s}`), null)
  assert.equal(await v('not.a.jwt'), null)
})
