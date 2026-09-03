import { NextResponse } from 'next/server'
import { authCookieOptions, createSession, roleForPassword } from '@/lib/auth'

export async function POST(request: Request) {
  const { password } = await request.json()

  const role = await roleForPassword(password)
  if (!role) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, role, redirectTo: role === 'food' ? '/food' : '/' })
  res.cookies.set('auth', await createSession(role), authCookieOptions)
  return res
}
