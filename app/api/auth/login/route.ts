import { NextResponse } from 'next/server'
import { authCookieOptions, createSession, roleForPassword } from '@/lib/auth'
import { clientIp, loginDecision } from '@/lib/rate-limit'
import { clearAttempts, getAttemptState, recordFailure } from '@/lib/login-attempts-store'

export async function POST(request: Request) {
  const ip = clientIp(request)
  const decision = loginDecision(await getAttemptState(ip), new Date())
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts', retryAfterSec: decision.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfterSec) } },
    )
  }

  const { password } = await request.json()

  const role = await roleForPassword(password)
  if (!role) {
    await recordFailure(ip)
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  await clearAttempts(ip)
  const res = NextResponse.json({ ok: true, role, redirectTo: role === 'food' ? '/food' : '/' })
  res.cookies.set('auth', await createSession(role), authCookieOptions)
  return res
}
