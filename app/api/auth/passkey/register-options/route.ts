import { generateRegistrationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { requireOwnerSession } from '@/lib/automation-auth'
import { demoForbidden } from '@/lib/demo-mode'
import { CHALLENGE_COOKIE, challengeCookieOptions, relyingParty, sealChallenge } from '@/lib/passkey-challenge'
import { listPasskeys } from '@/lib/passkey-store'

// Single-owner app: every passkey belongs to the same WebAuthn user handle, so
// the device's passkey picker shows one "PanTrainer" account.
const OWNER_USER_ID = new TextEncoder().encode('pantrainer-owner')

export async function POST(request: Request) {
  const denied = (await requireOwnerSession(request)) ?? demoForbidden()
  if (denied) return denied

  const { rpID } = relyingParty(request)
  const existing = await listPasskeys()
  const options = await generateRegistrationOptions({
    rpName: 'PanTrainer',
    rpID,
    userID: OWNER_USER_ID,
    userName: 'owner',
    userDisplayName: 'PanTrainer owner',
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p._id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })

  const res = NextResponse.json(options)
  res.cookies.set(CHALLENGE_COOKIE, sealChallenge(options.challenge, 'register', process.env.AUTH_SESSION_SECRET ?? ''), challengeCookieOptions)
  return res
}
