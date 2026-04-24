import crypto from 'crypto'

// In-memory store for auth codes (short-lived, single-server OK for personal use)
// Codes expire after 5 minutes
const pendingCodes = new Map<string, { state: string; redirectUri: string; expiresAt: number }>()

export function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const redirectUri = searchParams.get('redirect_uri') ?? ''
  const state = searchParams.get('state') ?? ''
  const clientId = searchParams.get('client_id') ?? ''

  if (!redirectUri || !state) {
    return new Response('Missing redirect_uri or state', { status: 400 })
  }

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
    <p>Allow Claude to read your training data and submit proposed plans on your behalf.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <button type="submit">Allow Access</button>
    </form>
  </div>
</body>
</html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const redirectUri = (form.get('redirect_uri') as string) ?? ''
  const state = (form.get('state') as string) ?? ''

  if (!redirectUri || !state) {
    return new Response('Missing redirect_uri or state', { status: 400 })
  }

  const code = crypto.randomBytes(24).toString('hex')
  pendingCodes.set(code, {
    state,
    redirectUri,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })

  const redirect = new URL(redirectUri)
  redirect.searchParams.set('code', code)
  redirect.searchParams.set('state', state)

  return Response.redirect(redirect.toString(), 302)
}

export function consumeCode(code: string, redirectUri: string): boolean {
  const entry = pendingCodes.get(code)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    pendingCodes.delete(code)
    return false
  }
  if (entry.redirectUri !== redirectUri) return false
  pendingCodes.delete(code)
  return true
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
