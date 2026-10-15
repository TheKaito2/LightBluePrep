/**
 * What a student reads when something fails.
 *
 * Errors arrive as whatever the layer below threw: a College Board URL with a
 * status line, "Failed to fetch", a Worker string such as "syncing too fast,
 * will retry shortly", or one that names server configuration. None of that is
 * for students, so it is matched here and swapped for copy. The raw error still
 * goes to the console, which is where a bug report starts.
 */

/** Where the call went: decides what a network failure is blamed on. */
export type ErrorSource = 'bank' | 'server' | 'signin'

export const MESSAGES = {
  bank: "Couldn't reach College Board's question bank. Check your connection and try again.",
  server: "Couldn't reach LightBluePrep's server. Check your connection and try again.",
  missing: "That question isn't in the bank anymore.",
  feedbackLimit: 'Too many messages. Try again in a minute.',
  rateLimit: 'Too many tries. Try again in a minute.',
  syncLimit: "Syncing paused for a moment. It'll retry.",
  inboxFull: 'The feedback inbox is full. Try again later.',
  feedbackDay: 'Feedback is full for today. Try again tomorrow.',
  storage: 'This account has reached its sync storage limit.',
  notAllowed: "This Google account can't sign in here.",
  signin: "Sign-in isn't available right now. Please try again later.",
  generic: 'Something went wrong. Try again, or send feedback if it keeps happening.',
} as const

const NETWORK = /failed to fetch|networkerror|load failed|network ?request failed|failed after \d+ attempts|timed? ?out|aborted/i

// First match wins, so the specific Worker strings sit above the broad ones.
const RULES: [RegExp, keyof typeof MESSAGES][] = [
  [/unknown question/i, 'missing'],
  [/too many messages/i, 'feedbackLimit'],
  [/syncing too fast/i, 'syncLimit'],
  [/too many/i, 'rateLimit'],
  [/inbox is full/i, 'inboxFull'],
  [/full for today/i, 'feedbackDay'],
  [/storage limit/i, 'storage'],
  [/not allowed to sign in/i, 'notAllowed'],
  [/GOOGLE_CLIENT_ID|sign-in/i, 'signin'],
]

export function toUserMessage(err: unknown, source: ErrorSource = 'bank'): string {
  console.error(err)
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  for (const [pattern, key] of RULES) if (pattern.test(text)) return MESSAGES[key]
  if (NETWORK.test(text)) return source === 'bank' ? MESSAGES.bank : MESSAGES.server
  // A sign-in that failed for a reason we cannot name is still sign-in failing.
  return source === 'signin' ? MESSAGES.signin : MESSAGES.generic
}
