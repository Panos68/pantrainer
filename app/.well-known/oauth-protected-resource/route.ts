export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = url.origin
  const requestedResource = url.searchParams.get('resource') ?? ''
  const resource =
    requestedResource && /^https?:\/[^/]/.test(requestedResource)
      ? requestedResource.replace(/^([a-z]+):\//i, '$1://')
      : requestedResource

  return Response.json({
    resource: resource || `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [],
  })
}
