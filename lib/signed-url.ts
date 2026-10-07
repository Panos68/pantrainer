import { createHmac, timingSafeEqual } from 'crypto'

// Short-lived signed links for private photos (Claude fetches them via MCP,
// mobile "open in new tab" has no cookie). Keyed by AUTH_SESSION_SECRET, not
// the login password; with no secret configured, signing fails closed.
export function signingSecret(): string {
  return process.env.AUTH_SESSION_SECRET ?? ''
}

export function signPath(pathname: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${pathname}:${exp}`).digest('hex')
}

export function verifyPathSignature(
  pathname: string,
  exp: string | null,
  sig: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !exp || !sig) return false
  const expTs = Number(exp)
  if (!expTs || nowSeconds > expTs) return false
  const expected = Buffer.from(signPath(pathname, expTs, secret), 'hex')
  const given = Buffer.from(sig, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
