import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAutomationAuthorized } from '@/lib/automation-auth'
import { isApiPath, isFoodPath, parseSession } from '@/lib/auth'

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const session = await parseSession(request.cookies.get('auth')?.value)

  if (session?.role === 'food' && !isFoodPath(pathname)) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const foodUrl = request.nextUrl.clone()
    foodUrl.pathname = '/food'
    foodUrl.search = ''
    return NextResponse.redirect(foodUrl)
  }

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

  if (session) {
    return NextResponse.next()
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('returnTo', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
