import { readAllArchivedWeeks, readCurrentWeek } from '@/lib/data'

// GET /api/history
// Returns all archived weeks sorted oldest→newest, plus current week if it exists
export async function GET() {
  const archived = readAllArchivedWeeks()
  const current = readCurrentWeek()

  const weeks = current ? [...archived, current] : archived

  return Response.json(weeks)
}
