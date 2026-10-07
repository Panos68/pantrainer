import { createHmac, timingSafeEqual } from 'crypto'

// WebAuthn challenges travel in a short-lived signed cookie instead of a DB
// row: the options endpoint sets it, the verify endpoint reads it back. The
// purpose field stops a login challenge from being replayed to register.
export type ChallengePurpose = 'register' | 'login'

export const CHALLENGE_COOKIE = 'pk_challenge'
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface ChallengePayload {
  challenge: string
  purpose: ChallengePurpose
  exp: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function sealChallenge(challenge: string, purpose: ChallengePurpose, secret: string, now = Date.now()): string {
  if (!secret) throw new Error('AUTH_SESSION_SECRET is not configured')
  const payload = Buffer.from(JSON.stringify({ challenge, purpose, exp: now + CHALLENGE_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function openChallenge(
  sealed: string | undefined,
  purpose: ChallengePurpose,
  secret: string,
  now = Date.now(),
): string | null {
  if (!sealed || !secret) return null
  const dot = sealed.indexOf('.')
  if (dot === -1) return null
  const payload = sealed.slice(0, dot)
  const given = Buffer.from(sealed.slice(dot + 1))
  const expected = Buffer.from(sign(payload, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ChallengePayload
    if (p.purpose !== purpose || typeof p.exp !== 'number' || p.exp < now) return null
    return typeof p.challenge === 'string' ? p.challenge : null
  } catch {
    return null
  }
}

export const challengeCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  maxAge: CHALLENGE_TTL_MS / 1000,
  path: '/api/auth/passkey',
}

// The relying party is whatever host served the request, so the same code
// works on production, previews and self-hosted domains. Passkeys are bound to
// that hostname by the browser.
export function relyingParty(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url)
  return { rpID: url.hostname, origin: url.origin }
}
