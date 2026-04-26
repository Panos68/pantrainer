function resolveResourceFromPath(resourcePath: string[], fallback: string): string {
  if (resourcePath.length === 0) return fallback

  const joined = resourcePath.join('/')
  try {
    return decodeURIComponent(joined)
  } catch {
    return joined
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string[] }> },
) {
  const base = new URL(request.url).origin
  const fallbackResource = `${base}/api/mcp`
  const { resource } = await params

  return Response.json({
    resource: resolveResourceFromPath(resource, fallbackResource),
    authorization_servers: [base],
  })
}
