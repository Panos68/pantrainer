import { readFoodNote, writeFoodNote } from '@/lib/data'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date) {
    return Response.json({ error: 'Missing date' }, { status: 400 })
  }
  const note = await readFoodNote(date)
  return Response.json(note)
}

export async function POST(request: Request) {
  const body = await request.json()
  const date = body.date
  const text = body.text
  if (typeof date !== 'string' || typeof text !== 'string') {
    return Response.json({ error: 'date and text are required strings' }, { status: 400 })
  }

  await writeFoodNote({ _id: date, text, updatedAt: new Date().toISOString() })
  return Response.json({ saved: true, date })
}
