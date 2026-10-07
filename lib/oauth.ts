import { createHash, createHmac, timingSafeEqual } from 'crypto'

// Stateless auth codes: base64url(JSON payload) + "." + HMAC. Bound to the
// redirect_uri, client and PKCE challenge, so a code is useless to anyone who
// doesn't hold the matching code_verifier.
export interface AuthCodePayload {
  exp: number
  redirect_uri: string
  client_id: string
  code_challenge: string
}

export const AUTH_CODE_TTL_MS = 5 * 60 * 1000

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signAuthCode(p: Omit<AuthCodePayload, 'exp'>, secret: string, now = Date.now()): string {
  if (!secret) throw new Error('AUTH_SESSION_SECRET is not configured')
  const payload = Buffer.from(JSON.stringify({ ...p, exp: now + AUTH_CODE_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifyAuthCode(code: string, secret: string, now = Date.now()): AuthCodePayload | null {
  if (!secret) return null
  const dot = code.indexOf('.')
  if (dot === -1) return null
  const payload = code.slice(0, dot)
  const sig = Buffer.from(code.slice(dot + 1))
  const expected = Buffer.from(sign(payload, secret))
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthCodePayload
    if (typeof p.exp !== 'number' || p.exp < now) return null
    if (typeof p.redirect_uri !== 'string' || typeof p.code_challenge !== 'string') return null
    return p
  } catch {
    return null
  }
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const given = Buffer.from(challenge)
  return computed.length === given.length && timingSafeEqual(computed, given)
}
