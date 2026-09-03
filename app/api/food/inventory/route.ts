import { randomUUID } from 'crypto'
import { FoodInventoryItemSchema } from '@/lib/schema'
import type { FoodInventoryItem } from '@/lib/schema'
import { readFoodInventory, readFoodInventoryItem, readFoodRestockSuggestions, readPantry, writeFoodInventoryItem, updateFoodInventoryStatus } from '@/lib/data'
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
  const [items, restockSuggestions, staples] = await Promise.all([
    readFoodInventory(),
    readFoodRestockSuggestions(),
    session?.role === 'owner' ? readPantry() : Promise.resolve([]),
  ])
  return Response.json({
    items,
    restockSuggestions,
    stapleSuggestions: staples.map((item) => ({ name: item.name, barcode: item.barcode })),
    canManageStaples: session?.role === 'owner',
  })
}

export async function POST(request: Request) {
  const denied = await requireFoodAccess(request)
  if (denied) return denied
  const body = await request.json()
  const now = new Date().toISOString()
  if (Array.isArray(body.names)) {
    const names = body.names.filter((name: unknown) => typeof name === 'string').map((name: string) => name.trim()).filter(Boolean).slice(0, 20)
    if (names.length === 0) return Response.json({ error: 'At least one food name is required' }, { status: 400 })
    const items: FoodInventoryItem[] = []
    for (const name of names) {
      const parsed = FoodInventoryItemSchema.safeParse({
        _id: randomUUID(), name, location: body.location, quantity: 'some', expiresOn: null,
        status: 'available', createdAt: now, updatedAt: now,
      })
      if (!parsed.success) return Response.json({ error: 'Invalid food items' }, { status: 400 })
      items.push(parsed.data)
    }
    await Promise.all(items.map(writeFoodInventoryItem))
    return Response.json({ items }, { status: 201 })
  }
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
