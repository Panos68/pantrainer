import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAutomationAuthorized } from '@/lib/automation-auth'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/.well-known/',
  '/api/oauth/authorize',
  '/api/oauth/token',
  '/api/oauth/register',
  '/api/mcp',
  '/api/automation',
  '/api/revalidate',
  '/api/week/activate',
  // Vercel Cron invokes this with its own Bearer CRON_SECRET header, not the
  // login cookie — without this it would be redirected to /login and the job
  // would silently never run. The route authorizes the secret itself.
  '/api/cron/',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow unauthenticated photo reads so previews/open-in-new-tab work on mobile browsers/PWAs.
  if (pathname.startsWith('/api/photos') && request.method === 'GET') {
    return NextResponse.next()
  }

  // Allow food photo uploads authenticated with the automation token (not the login
  // password) so an iOS Shortcut / share-sheet action can upload without holding the
  // real login credential — same token already used for the MCP OAuth flow.
  if (pathname.startsWith('/api/food-photos') && request.method === 'POST' && isAutomationAuthorized(request)) {
    return NextResponse.next()
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const auth = request.cookies.get('auth')?.value
  if (auth === process.env.AUTH_PASSWORD) {
    return NextResponse.next()
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
