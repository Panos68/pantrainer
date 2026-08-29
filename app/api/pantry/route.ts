import { readPantry, writePantryItem, deletePantryItem, seedPantryIfEmpty } from '@/lib/data'
import { PantryItemSchema } from '@/lib/schema'

export async function GET() {
  await seedPantryIfEmpty()
  const pantry = await readPantry()
  return Response.json({ pantry })
}

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = PantryItemSchema.safeParse({
    ...body,
    // An edit is the athlete's own number, so it stops being seeded data and
    // loses the "confirm against the package" badge.
    source: body.source ?? 'manual',
    updatedAt: new Date().toISOString(),
  })
  if (!parsed.success) {
    return Response.json({ error: 'Invalid pantry item', issues: parsed.error.issues }, { status: 400 })
  }
  await writePantryItem(parsed.data)
  return Response.json({ saved: true, item: parsed.data })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }
  await deletePantryItem(id)
  return Response.json({ deleted: true, id })
}
