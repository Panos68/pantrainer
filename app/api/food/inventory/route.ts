import { randomUUID } from 'crypto'
import { FoodInventoryItemSchema } from '@/lib/schema'
import { readFoodInventory, readFoodInventoryItem, writeFoodInventoryItem, updateFoodInventoryStatus } from '@/lib/data'
import { getSession } from '@/lib/auth'

async function requireFoodAccess(request: Request): Promise<Response | null> {
  const session = await getSession(request)
  if (session?.role === 'owner' || session?.role === 'food') return null
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(request: Request) {
  const denied = await requireFoodAccess(request)
  if (denied) return denied
  const session = await getSession(request)
  return Response.json({ items: await readFoodInventory(), canManageStaples: session?.role === 'owner' })
}

export async function POST(request: Request) {
  const denied = await requireFoodAccess(request)
  if (denied) return denied
  const body = await request.json()
  const now = new Date().toISOString()
  const parsed = FoodInventoryItemSchema.safeParse({
    ...body,
    _id: randomUUID(),
    status: 'available',
    createdAt: now,
    updatedAt: now,
  })
  if (!parsed.success) {
    return Response.json({ error: 'Invalid food item', issues: parsed.error.issues }, { status: 400 })
  }
  await writeFoodInventoryItem(parsed.data)
  return Response.json({ item: parsed.data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const denied = await requireFoodAccess(request)
  if (denied) return denied
  const body = await request.json()
  if (typeof body.id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }
  if (body.status === 'used' || body.status === 'discarded') {
    if (!await updateFoodInventoryStatus(body.id, body.status)) {
      return Response.json({ error: 'Food item not found' }, { status: 404 })
    }
    return Response.json({ updated: true })
  }
  const existing = await readFoodInventoryItem(body.id)
  if (!existing) {
    return Response.json({ error: 'Food item not found' }, { status: 404 })
  }
  const parsed = FoodInventoryItemSchema.safeParse({ ...existing, ...body, _id: existing._id, status: 'available', createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  if (!parsed.success) {
    return Response.json({ error: 'Invalid food item', issues: parsed.error.issues }, { status: 400 })
  }
  await writeFoodInventoryItem(parsed.data)
  return Response.json({ item: parsed.data })
}
