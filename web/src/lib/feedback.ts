/**
 * Bug reports and comments, sent to the sync Worker's anonymous /feedback
 * endpoint, plus the admin inbox calls. Only available when the build has a
 * sync API configured.
 */
import { API, request } from './auth'

export type FeedbackKind = 'bug' | 'comment'

export interface FeedbackContext {
  question_id?: string
  cb_id?: string | null
  /** Which screen it was sent from, e.g. 'question' or 'about'. */
  context?: string
}

export interface FeedbackItem {
  id: string
  created_at: number
  kind: FeedbackKind
  message: string
  question_id: string | null
  cb_id: string | null
  context: string | null
  status: 'open' | 'done'
}

export const MAX_CHARS = 2000
export const available = Boolean(API)

async function ok(res: Response): Promise<Response> {
  if (res.ok) return res
  const body = await res.json().catch(() => null) as { error?: string } | null
  throw new Error(body?.error ?? `request failed (${res.status})`)
}

export async function send(
  kind: FeedbackKind, message: string, ctx: FeedbackContext, website = '',
): Promise<void> {
  // A bare fetch, not request(): request() attaches the session token, and an
  // anonymous message must not carry anything that could tie it to an account,
  // even if the Worker ignores it today.
  await ok(await fetch(`${API}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // ctx goes first: the dialog's chosen kind must win over the opener's default.
    body: JSON.stringify({ ...ctx, kind, message, cb_id: ctx.cb_id ?? undefined, fax_ref: website }),
  }))
}

export async function isAdmin(): Promise<boolean> {
  const res = await request('/admin/me')
  if (!res.ok) return false
  const body = await res.json() as { admin?: boolean }
  return Boolean(body.admin)
}

/** The usage scoreboard: totals from the Worker's milestones table, and accounts. */
export interface UsageStats { tried: number; used: number; tried_today: number; accounts: number }

export async function stats(): Promise<UsageStats> {
  const res = await ok(await request('/admin/stats'))
  return await res.json() as UsageStats
}

export async function list(): Promise<FeedbackItem[]> {
  const res = await ok(await request('/admin/feedback'))
  return ((await res.json()) as { feedback: FeedbackItem[] }).feedback
}

export async function setStatus(id: string, status: 'open' | 'done'): Promise<void> {
  await ok(await request(`/admin/feedback/${id}`, {
    method: 'POST', body: JSON.stringify({ status }),
  }))
}

export async function removeDone(): Promise<void> {
  await ok(await request('/admin/feedback?status=done', { method: 'DELETE' }))
}

export async function remove(id: string): Promise<void> {
  await ok(await request(`/admin/feedback/${id}`, { method: 'DELETE' }))
}
