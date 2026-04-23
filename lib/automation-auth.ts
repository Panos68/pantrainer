export function isAutomationAuthorized(request: Request): boolean {
  const expected = process.env.AUTOMATION_API_TOKEN
  if (!expected) return false

  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return false

  const token = authHeader.slice(7).trim()
  return token.length > 0 && token === expected
}

export function requireAutomationToken(): { ok: true } | { ok: false; response: Response } {
  if (!process.env.AUTOMATION_API_TOKEN) {
    return {
      ok: false,
      response: Response.json(
        { error: 'AUTOMATION_API_TOKEN is not configured' },
        { status: 500 },
      ),
    }
  }

  return { ok: true }
}
