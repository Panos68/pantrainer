import { readAllArchivedWeeks, readCurrentWeek } from '@/lib/data'

export async function GET() {
  const [archived, current] = await Promise.all([
    readAllArchivedWeeks(),
    readCurrentWeek(),
  ])
  const weeks = current ? [...archived, current] : archived
  return Response.json(weeks)
}
