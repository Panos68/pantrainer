import { requireOwnerSession } from '@/lib/automation-auth'
import { deletePasskey } from '@/lib/passkey-store'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const { id } = await params
  const ok = await deletePasskey(decodeURIComponent(id))
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
}
