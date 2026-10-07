import { NextResponse } from 'next/server'
import { authCookieOptions, createSession } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo-mode'

export function GET() {
  return NextResponse.json({ enabled: isDemoMode() })
}

// One-click sign-in, only on demo instances.
export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const res = NextResponse.json({ ok: true, redirectTo: '/' })
  res.cookies.set('auth', await createSession('owner'), { ...authCookieOptions, maxAge: 60 * 60 * 24 })
  return res
}
