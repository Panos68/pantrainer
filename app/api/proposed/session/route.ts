import { format } from 'date-fns'
import { readProposedPlan } from '@/lib/data'

export async function GET(request: Request) {
  const proposed = await readProposedPlan()
  if (!proposed) {
    return Response.json({ error: 'No proposed plan found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const targetDate = searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd')
  const targetDay = searchParams.get('day')

  const session = proposed.week_doc.sessions.find((s) => {
    if (targetDay) {
      return s.day.toLowerCase() === targetDay.toLowerCase()
    }
    return s.date === targetDate
  })

  if (!session) {
    return Response.json(
      { error: targetDay ? `No proposed session found for ${targetDay}` : `No proposed session found for ${targetDate}` },
      { status: 404 },
    )
  }

  return Response.json({
    created_at: proposed.created_at,
    source: proposed.source,
    run_type: proposed.run_type,
    session,
  })
}
