import { readCurrentWeek } from '@/lib/data'

// GET /api/week
// Returns current week JSON or { empty: true } if no current week exists
export async function GET() {
  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ empty: true })
  }
  return Response.json(week)
}
