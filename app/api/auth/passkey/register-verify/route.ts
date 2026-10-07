import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { requireOwnerSession } from '@/lib/automation-auth'
import { CHALLENGE_COOKIE, openChallenge, relyingParty } from '@/lib/passkey-challenge'
import { addPasskey } from '@/lib/passkey-store'

function readCookie(request: Request, name: string): string | undefined {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export async function POST(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { response?: RegistrationResponseJSON; name?: unknown }
  if (!body.response) return NextResponse.json({ error: 'Missing response' }, { status: 400 })

  const expectedChallenge = openChallenge(readCookie(request, CHALLENGE_COOKIE), 'register', process.env.AUTH_SESSION_SECRET ?? '')
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge expired — try again' }, { status: 400 })

  const { rpID, origin } = relyingParty(request)
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verification failed' }, { status: 400 })
  }
  if (!verification.verified) return NextResponse.json({ error: 'Verification failed' }, { status: 400 })

  const { credential } = verification.registrationInfo
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'Passkey'
  await addPasskey({
    _id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    name,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: '/api/auth/passkey' })
  return res
}
