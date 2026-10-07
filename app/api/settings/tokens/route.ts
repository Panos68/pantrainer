import { requireOwnerSession } from '@/lib/automation-auth'
import { createPersonalToken, listTokens } from '@/lib/api-token-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const listing = await listTokens()
  return Response.json(
    { ...listing, legacyTokenActive: Boolean(process.env.AUTOMATION_API_TOKEN?.trim()) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const body = await request.json().catch(() => ({})) as { name?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 })
  return Response.json(await createPersonalToken(name), { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
