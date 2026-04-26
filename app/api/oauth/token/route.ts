import { verifyCode } from '../authorize/route'

export async function POST(request: Request) {
  let body: Record<string, string>

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    body = Object.fromEntries(new URLSearchParams(text))
  } else {
    body = await request.json()
  }

  const { grant_type, code, redirect_uri } = body

  if (grant_type !== 'authorization_code') {
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }

  if (!code || !redirect_uri) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (!verifyCode(code, redirect_uri)) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 })
  }

  const token = process.env.AUTOMATION_API_TOKEN
  if (!token) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({
    access_token: token,
    token_type: 'Bearer',
    // No expiry — token is valid as long as AUTOMATION_API_TOKEN doesn't change
  })
}
