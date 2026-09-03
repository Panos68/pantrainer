import { PantryItemSchema } from '@/lib/schema'
import { writePantryItem } from '@/lib/data'
import { getSession } from '@/lib/auth'

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  if ((await getSession(request))?.role !== 'owner') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const parsed = PantryItemSchema.safeParse({
    _id: slugify(name),
    name,
    barcode: body.barcode,
    aliases: name ? [name.toLowerCase()] : [],
    visualCue: '',
    per100g: body.per100g,
    usualGrams: body.usualGrams,
    source: 'scanned',
    updatedAt: new Date().toISOString(),
  })
  if (!parsed.success) {
    return Response.json({ error: 'Invalid staple', issues: parsed.error.issues }, { status: 400 })
  }
  await writePantryItem(parsed.data)
  return Response.json({ item: parsed.data }, { status: 201 })
}
