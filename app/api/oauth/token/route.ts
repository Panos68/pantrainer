import { verifyAuthCode, verifyPkce } from '@/lib/oauth'
import { issueOAuthGrant, rotateRefreshToken } from '@/lib/api-token-store'

const NO_STORE = { 'Cache-Control': 'no-store' }

function oauthError(error: string, status = 400) {
  return Response.json({ error }, { status, headers: NO_STORE })
}

async function readBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(await request.text()))
  }
  return (await request.json().catch(() => ({}))) as Record<string, string>
}

export async function POST(request: Request) {
  const body = await readBody(request)

  if (body.grant_type === 'authorization_code') {
    const { code, redirect_uri, code_verifier, client_id } = body
    if (!code || !redirect_uri || !code_verifier) return oauthError('invalid_request')
    const payload = verifyAuthCode(code, process.env.AUTH_SESSION_SECRET ?? '')
    if (!payload || payload.redirect_uri !== redirect_uri) return oauthError('invalid_grant')
    if (client_id && payload.client_id && client_id !== payload.client_id) return oauthError('invalid_grant')
    if (!verifyPkce(code_verifier, payload.code_challenge)) return oauthError('invalid_grant')
    const clientName = new URL(redirect_uri).host
    return Response.json(await issueOAuthGrant(clientName), { headers: NO_STORE })
  }

  if (body.grant_type === 'refresh_token') {
    if (!body.refresh_token) return oauthError('invalid_request')
    const rotated = await rotateRefreshToken(body.refresh_token)
    if (!rotated) return oauthError('invalid_grant')
    return Response.json(rotated, { headers: NO_STORE })
  }

  return oauthError('unsupported_grant_type')
}
