import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'
import { WeekDocSchema } from '@/lib/schema'

// PATCH /api/week/current
// Body: partial WeekDoc fields to merge
// Used for: clearing individual health flags
// Returns: updated WeekDoc
export async function PATCH(request: Request) {
  const current = await readCurrentWeek()
  if (!current) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const merged = { ...current, ...body }
  const result = WeekDocSchema.safeParse(merged)
  if (!result.success) {
    return Response.json(
      { error: 'Invalid week data', issues: result.error.issues },
      { status: 422 }
    )
  }

  await writeCurrentWeek(result.data)
  return Response.json(result.data)
}
