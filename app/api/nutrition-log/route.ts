import { readNutritionLogEntry } from '@/lib/data'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date) {
    return Response.json({ error: 'Missing date' }, { status: 400 })
  }
  const entry = await readNutritionLogEntry(date)
  return Response.json(entry)
}
