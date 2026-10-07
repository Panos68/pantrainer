import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { authCookieOptions, createSession } from '@/lib/auth'
import { CHALLENGE_COOKIE, openChallenge, relyingParty } from '@/lib/passkey-challenge'
import { getPasskey, markPasskeyUsed } from '@/lib/passkey-store'
import { clientIp, loginDecision } from '@/lib/rate-limit'
import { clearAttempts, getAttemptState, recordFailure } from '@/lib/login-attempts-store'

function readCookie(request: Request, name: string): string | undefined {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  const decision = loginDecision(await getAttemptState(ip), new Date())
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts', retryAfterSec: decision.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfterSec) } },
    )
  }

  const body = (await request.json().catch(() => ({}))) as { response?: AuthenticationResponseJSON }
  if (!body.response) return NextResponse.json({ error: 'Missing response' }, { status: 400 })

  const expectedChallenge = openChallenge(readCookie(request, CHALLENGE_COOKIE), 'login', process.env.AUTH_SESSION_SECRET ?? '')
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge expired — try again' }, { status: 400 })

  const passkey = await getPasskey(body.response.id)
  if (!passkey) {
    await recordFailure(ip)
    return NextResponse.json({ error: 'Unknown passkey' }, { status: 401 })
  }

  const { rpID, origin } = relyingParty(request)
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey._id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    })
  } catch {
    verification = null
  }
  if (!verification?.verified) {
    await recordFailure(ip)
    return NextResponse.json({ error: 'Passkey not accepted' }, { status: 401 })
  }

  await markPasskeyUsed(passkey._id, verification.authenticationInfo.newCounter)
  await clearAttempts(ip)
  const res = NextResponse.json({ ok: true, role: 'owner', redirectTo: '/' })
  res.cookies.set('auth', await createSession('owner'), authCookieOptions)
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: '/api/auth/passkey' })
  return res
}
