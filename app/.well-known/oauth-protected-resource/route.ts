export async function GET(request: Request) {
  const base = new URL(request.url).origin

  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
  })
}
