import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES, toUserMessage } from './errors'

describe('toUserMessage', () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => { log = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => log.mockRestore())

  it('blames College Board for network failures on the bank', () => {
    const cb = 'https://qbank-api.collegeboard.org/x failed after 4 attempts: Error: 500 Internal Server Error'
    expect(toUserMessage(new Error(cb))).toBe(MESSAGES.bank)
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(MESSAGES.bank)
    expect(toUserMessage(new TypeError('Load failed'))).toBe(MESSAGES.bank)
    expect(toUserMessage(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(MESSAGES.bank)
    expect(toUserMessage(new DOMException('signal timed out', 'TimeoutError'))).toBe(MESSAGES.bank)
  })

  it('blames our server for network failures elsewhere', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'), 'server')).toBe(MESSAGES.server)
  })

  it('names a question that left the bank', () => {
    expect(toUserMessage(new Error('unknown question abc123'))).toBe(MESSAGES.missing)
  })

  it('rewrites the Worker rate limits', () => {
    expect(toUserMessage(new Error('too many messages, try again in a minute'), 'server'))
      .toBe(MESSAGES.feedbackLimit)
    expect(toUserMessage(new Error('syncing too fast, will retry shortly'), 'server'))
      .toBe(MESSAGES.syncLimit)
    expect(toUserMessage(new Error('too many sign-in attempts, try again in a minute'), 'signin'))
      .toBe(MESSAGES.rateLimit)
  })

  it('rewrites the other Worker strings a student can hit', () => {
    expect(toUserMessage(new Error('feedback inbox is full, try again later'), 'server'))
      .toBe(MESSAGES.inboxFull)
    expect(toUserMessage(new Error('Feedback is full for today. Try again tomorrow.'), 'server'))
      .toBe(MESSAGES.feedbackDay)
    expect(toUserMessage(new Error('storage limit reached for attempts on this account'), 'server'))
      .toBe(MESSAGES.storage)
    expect(toUserMessage(new Error('this account is not allowed to sign in'), 'signin'))
      .toBe(MESSAGES.notAllowed)
  })

  it('maps the sentence-case Worker strings the same as the old ones', () => {
    expect(toUserMessage(new Error('Too many messages. Try again in a minute.'), 'server'))
      .toBe(MESSAGES.feedbackLimit)
    expect(toUserMessage(new Error('Syncing too fast. Will retry shortly.'), 'server'))
      .toBe(MESSAGES.syncLimit)
    expect(toUserMessage(new Error('Too many sign-in attempts. Try again in a minute.'), 'signin'))
      .toBe(MESSAGES.rateLimit)
    expect(toUserMessage(new Error('The feedback inbox is full. Try again later.'), 'server'))
      .toBe(MESSAGES.inboxFull)
    expect(toUserMessage(new Error('This account is not allowed to sign in.'), 'signin'))
      .toBe(MESSAGES.notAllowed)
    expect(toUserMessage(new Error('Sign-in is temporarily unavailable.'), 'signin'))
      .toBe(MESSAGES.signin)
  })

  it('never shows sign-in configuration', () => {
    const old = 'GOOGLE_CLIENT_ID is not set on the Worker. Check GET /health.'
    expect(toUserMessage(new Error(old), 'signin')).toBe(MESSAGES.signin)
    expect(toUserMessage('Could not reach Google sign-in')).toBe(MESSAGES.signin)
    expect(toUserMessage(new Error('server error'), 'signin')).toBe(MESSAGES.signin)
  })

  it('falls back to a generic line, and always logs the raw error', () => {
    const raw = new Error('bad body')
    expect(toUserMessage(raw)).toBe(MESSAGES.generic)
    expect(toUserMessage(new Error('server error'), 'server')).toBe(MESSAGES.generic)
    expect(toUserMessage(undefined)).toBe(MESSAGES.generic)
    expect(log).toHaveBeenCalledWith(raw)
  })
})
