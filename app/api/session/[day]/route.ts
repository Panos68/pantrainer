import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'
import { updateLiftProgression } from '@/lib/progression'
import type { Session, WeekSummary } from '@/lib/schema'

function todayIsoLocal(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }
  const session = week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase())
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }
  return Response.json(session)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeek()
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

  const body = await req.json() as Partial<Session>
  const nextStatus = body.status ?? session.status
  const sessionIsFuture = session.date > todayIsoLocal()
  const isLoggingAction =
    nextStatus === 'in_progress' || nextStatus === 'completed' || nextStatus === 'skipped'
  if (sessionIsFuture && isLoggingAction) {
    return Response.json(
      { error: 'Cannot log progress for a future session date' },
      { status: 409 },
    )
  }

  const updatedSession: Session = { ...session, ...body }
  week.sessions[sessionIndex] = updatedSession

  if (body.status === 'completed') {
    week.week_summary = recalculateWeekSummary(week.sessions)
    if (updatedSession.type === 'Strength' && updatedSession.exercises.length > 0) {
      week.lift_progression = updateLiftProgression(
        updatedSession.exercises,
        week.lift_progression,
      )
    }
  }

  await writeCurrentWeek(week)
  return Response.json(updatedSession)
}
