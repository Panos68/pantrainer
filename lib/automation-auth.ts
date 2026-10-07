import { constantTimeEqual, getSession } from './auth'

// One place that decides whether an Authorization: Bearer header is valid.
// Accepts the legacy AUTOMATION_API_TOKEN env value (so existing connectors,
// cowork jobs and the iOS Shortcut keep working) or a hashed DB token.
export function parseBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token.length > 0 ? token : null
}

export async function checkBearer(
  token: string | null,
  legacy: string | undefined,
  lookup: (t: string) => Promise<unknown | null>,
): Promise<boolean> {
  if (!token) return false
  const legacyToken = legacy?.trim()
  if (legacyToken && constantTimeEqual(token, legacyToken)) return true
  return (await lookup(token)) != null
}

export async function authorizeBearer(request: Request): Promise<boolean> {
  return checkBearer(parseBearer(request), process.env.AUTOMATION_API_TOKEN, async (t) => {
    // Imported lazily so modules using this helper don't pull Mongo in at import time.
    const { findUsableBearerToken } = await import('./api-token-store')
    return findUsableBearerToken(t)
  })
}

export async function requireOwnerOrBearer(request: Request): Promise<Response | null> {
  if ((await getSession(request))?.role === 'owner') return null
  if (await authorizeBearer(request)) return null
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const token = parseBearer(request)
  return token != null && constantTimeEqual(token, secret)
}

// Cookie-only owner check for account management (tokens, passkeys): a leaked
// Bearer token must not be able to mint more credentials.
export async function requireOwnerSession(request: Request): Promise<Response | null> {
  return (await getSession(request))?.role === 'owner'
    ? null
    : Response.json({ error: 'Forbidden' }, { status: 403 })
}
