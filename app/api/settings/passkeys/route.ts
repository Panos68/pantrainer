import { requireOwnerSession } from '@/lib/automation-auth'
import { listPasskeys } from '@/lib/passkey-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const passkeys = (await listPasskeys()).map((p) => ({
    id: p._id,
    name: p.name,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
  }))
  return Response.json({ passkeys }, { headers: { 'Cache-Control': 'no-store' } })
}
