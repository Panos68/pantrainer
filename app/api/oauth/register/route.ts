import crypto from 'crypto'

// Minimal RFC 7591 dynamic client registration. We don't persist or validate
// clients (the token endpoint issues a single fixed AUTOMATION_API_TOKEN
// regardless of client), so we just mint an id and echo back the metadata.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const clientId = crypto.randomBytes(16).toString('hex')

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris ?? [],
      token_endpoint_auth_method: 'none',
      grant_types: body.grant_types ?? ['authorization_code'],
      response_types: body.response_types ?? ['code'],
      client_name: body.client_name,
    },
    { status: 201 }
  )
}
