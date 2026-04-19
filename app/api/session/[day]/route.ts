import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'
import type { Session, WeekSummary } from '@/lib/schema'

function recalculateWeekSummary(sessions: Session[]): WeekSummary {
  const completed = sessions.filter((s) => s.status === 'completed')
  return {
    total_sessions: completed.length,
    high_output_days: completed.filter((s) => s.type === 'Conditioning').length,
    strength_days: completed.filter((s) => s.type === 'Strength').length,
    recovery_days: completed.filter((s) => s.type === 'Recovery' || s.type === 'Rest').length,
    total_calories: completed.reduce((sum, s) => sum + (s.total_calories ?? 0), 0),
    notes: '',
  }
}

// GET /api/session/[day]
// Returns the session for that day
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const session = week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase())
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  return Response.json(session)
}

// PATCH /api/session/[day]
// Body: Partial<Session> — the updated fields
// Rules:
//   - Only updates sessions with status 'planned' or 'in_progress'
//   - If body has { status: 'completed' } → recalculate week_summary
//   - Returns updated session
//   - Returns 409 if session is already 'completed' or 'skipped' (immutable)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const sessionIndex = week.sessions.findIndex(
    (s) => s.day.toLowerCase() === day.toLowerCase(),
  )
  if (sessionIndex === -1) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  const session = week.sessions[sessionIndex]

  // Immutable if already completed or skipped
  if (session.status === 'completed' || session.status === 'skipped') {
    return Response.json(
      { error: 'Session is already finalized and cannot be updated' },
      { status: 409 },
    )
  }

  const body = await req.json() as Partial<Session>

  const updatedSession: Session = {
    ...session,
    ...body,
  }

  week.sessions[sessionIndex] = updatedSession

  // Recalculate week summary when completing
  if (body.status === 'completed') {
    week.week_summary = recalculateWeekSummary(week.sessions)
  }

  writeCurrentWeek(week)

  return Response.json(updatedSession)
}
