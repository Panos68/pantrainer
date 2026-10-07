import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { CHALLENGE_COOKIE, challengeCookieOptions, relyingParty, sealChallenge } from '@/lib/passkey-challenge'
import { countPasskeys } from '@/lib/passkey-store'

// Public: the login page asks for options before anyone is signed in. Uses
// discoverable credentials (no allowCredentials), so the device offers its
// saved PanTrainer passkey directly.
export async function POST(request: Request) {
  if ((await countPasskeys()) === 0) {
    return NextResponse.json({ available: false })
  }
  const { rpID } = relyingParty(request)
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
  const res = NextResponse.json({ available: true, options })
  res.cookies.set(CHALLENGE_COOKIE, sealChallenge(options.challenge, 'login', process.env.AUTH_SESSION_SECRET ?? ''), challengeCookieOptions)
  return res
}
