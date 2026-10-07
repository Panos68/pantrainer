import { requireOwnerSession } from '@/lib/automation-auth'
import { revokeTokenOrGrant } from '@/lib/api-token-store'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const { id } = await params
  if (!/^[0-9a-f]{64}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const ok = await revokeTokenOrGrant(id)
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
}
