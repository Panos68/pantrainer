import { readPlateInventory, writePlateInventory } from '@/lib/data'
import { PlateInventorySchema } from '@/lib/schema'
import { requireOwnerSession } from '@/lib/automation-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await readPlateInventory(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const parsed = PlateInventorySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid plate inventory' }, { status: 400 })
  await writePlateInventory(parsed.data)
  return Response.json(parsed.data)
}
