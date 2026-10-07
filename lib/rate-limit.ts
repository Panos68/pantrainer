// Fixed-window login throttle: LOGIN_MAX_FAILURES failed passwords per IP per
// window. Pure so the decision logic is testable; storage lives in
// login-attempts-store.ts.
export const LOGIN_MAX_FAILURES = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000

export interface AttemptState {
  failures: number
  windowStart: string
}

function windowExpired(state: AttemptState, now: Date): boolean {
  return now.getTime() - new Date(state.windowStart).getTime() > LOGIN_WINDOW_MS
}

export function loginDecision(state: AttemptState | null, now: Date): { allowed: boolean; retryAfterSec: number } {
  if (!state || windowExpired(state, now) || state.failures < LOGIN_MAX_FAILURES) {
    return { allowed: true, retryAfterSec: 0 }
  }
  const resetAt = new Date(state.windowStart).getTime() + LOGIN_WINDOW_MS
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)) }
}

export function nextFailure(state: AttemptState | null, now: Date): AttemptState {
  if (!state || windowExpired(state, now)) return { failures: 1, windowStart: now.toISOString() }
  return { failures: state.failures + 1, windowStart: state.windowStart }
}

// Forwarding headers are only trustworthy when a proxy we control sets them:
// on Vercel, or when TRUST_PROXY=true behind a reverse proxy that overwrites
// X-Forwarded-For. Otherwise anyone could rotate the header to dodge the limit,
// so every attempt shares one bucket (safe, if stricter).
export function clientIp(request: Request, env: Record<string, string | undefined> = process.env): string {
  const trusted = Boolean(env.VERCEL) || env.TRUST_PROXY === 'true'
  if (!trusted) return 'untrusted-client'
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}
