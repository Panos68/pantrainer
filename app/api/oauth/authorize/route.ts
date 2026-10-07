import { getSession } from '@/lib/auth'
import { signAuthCode } from '@/lib/oauth'
import { demoForbidden } from '@/lib/demo-mode'

// OAuth authorization endpoint for MCP clients (claude.ai connectors). The owner
// must be logged in; the consent page names the site asking. Codes are bound to
// the redirect_uri, client and PKCE challenge (see lib/oauth.ts).

async function requireOwner(request: Request): Promise<Response | null> {
  const session = await getSession(request)
  if (session?.role === 'owner') return null
  if (session?.role === 'food') return new Response('Forbidden', { status: 403 })

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('returnTo', `${new URL(request.url).pathname}${new URL(request.url).search}`)
  return Response.redirect(loginUrl, 302)
}

function readParams(get: (k: string) => string | null) {
  return {
    redirectUri: get('redirect_uri') ?? '',
    state: get('state') ?? '',
    clientId: get('client_id') ?? '',
    codeChallenge: get('code_challenge') ?? '',
    codeChallengeMethod: get('code_challenge_method') ?? '',
  }
}

function redirectHost(redirectUri: string): string | null {
  try {
    const url = new URL(redirectUri)
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.host : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const denied = await requireOwner(request)
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  const p = readParams((k) => searchParams.get(k))

  if (!p.redirectUri || !p.state) {
    return new Response('Missing redirect_uri or state', { status: 400 })
  }
  if (!p.codeChallenge || p.codeChallengeMethod !== 'S256') {
    return new Response('PKCE (code_challenge with S256) is required', { status: 400 })
  }
  const host = redirectHost(p.redirectUri)
  if (!host) return new Response('Invalid redirect_uri', { status: 400 })

  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect PanTrainer</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #18181b; color: #e4e4e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #27272a; border: 1px solid #3f3f46; border-radius: 12px; padding: 2rem; max-width: 380px; width: 100%; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; font-size: 0.9rem; margin: 0 0 1.5rem; }
    .app { font-weight: 600; color: #f4f4f5; }
    button { background: #3b82f6; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; width: 100%; }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to <span class="app">PanTrainer</span></h1>
    <p><strong class="app">${escapeHtml(host)}</strong> wants to read your training data and submit proposed plans on your behalf.</p>
    <form method="POST">
      ${hidden('redirect_uri', p.redirectUri)}
      ${hidden('state', p.state)}
      ${hidden('client_id', p.clientId)}
      ${hidden('code_challenge', p.codeChallenge)}
      ${hidden('code_challenge_method', p.codeChallengeMethod)}
      <button type="submit">Allow Access</button>
    </form>
  </div>
</body>
</html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}

export async function POST(request: Request) {
  const denied = (await requireOwner(request)) ?? demoForbidden()
  if (denied) return denied
  const form = await request.formData()
  const p = readParams((k) => form.get(k) as string | null)
  if (!p.redirectUri || !p.state || !p.codeChallenge || p.codeChallengeMethod !== 'S256' || !redirectHost(p.redirectUri)) {
    return new Response('Invalid authorization request', { status: 400 })
  }

  const code = signAuthCode(
    { redirect_uri: p.redirectUri, client_id: p.clientId, code_challenge: p.codeChallenge },
    process.env.AUTH_SESSION_SECRET ?? '',
  )
  const redirect = new URL(p.redirectUri)
  redirect.searchParams.set('code', code)
  redirect.searchParams.set('state', p.state)
  return Response.redirect(redirect.toString(), 302)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
