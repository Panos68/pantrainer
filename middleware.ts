import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/.well-known/oauth-authorization-server',
  '/api/oauth/authorize',
  '/api/oauth/token',
  '/api/mcp',
  '/api/automation',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow unauthenticated photo reads so previews/open-in-new-tab work on mobile browsers/PWAs.
  if (pathname.startsWith('/api/photos') && request.method === 'GET') {
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
