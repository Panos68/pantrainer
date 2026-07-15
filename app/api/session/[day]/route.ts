import { readCurrentWeekDirect, writeCurrentWeek } from '@/lib/data'
import { deriveExerciseAggregates } from '@/lib/liveSession'
import { updateLiftProgression } from '@/lib/progression'
import type { Session, WeekSummary } from '@/lib/schema'

export const dynamic = 'force-dynamic'

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

function recalculateLiftProgression(sessions: Session[]): Record<string, string | number | null> {
  let progression: Record<string, string | number | null> = {}
  for (const s of sessions) {
    if (s.status !== 'completed' || s.type !== 'Strength' || s.exercises.length === 0) continue
    progression = updateLiftProgression(s.exercises, progression)
  }
  return progression
}

function hydrateExerciseAggregates(session: Session): Session {
  function hydrateExercise(ex: Session['exercises'][number]): Session['exercises'][number] {
    const log = ex.set_log ?? []
    if (log.length === 0) return ex
    const derived = deriveExerciseAggregates(ex, log)
    return {
      ...ex,
      actual_sets: derived.actual_sets,
      actual_reps: derived.actual_reps,
      actual_weight_kg: derived.actual_weight_kg,
      effort: derived.effort,
    }
  }

  if (session.exercise_groups && session.exercise_groups.length > 0) {
    const sourceExercises = session.exercises ?? []
    let globalIndex = 0
    const exercise_groups = session.exercise_groups.map((group) => ({
      ...group,
      exercises: group.exercises.map((ex) => {
        const source = sourceExercises[globalIndex++]
        return hydrateExercise(source ?? ex)
      }),
    }))
    return {
      ...session,
      exercise_groups,
      exercises: exercise_groups.flatMap((group) => group.exercises),
    }
  }

  return {
    ...session,
    exercises: session.exercises.map(hydrateExercise),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeekDirect()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }
  const session = week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase())
  if (!session) {
    return Response.json(
      { error: 'Session not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }
  return Response.json(session, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeekDirect()
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

  const updatedSession: Session = hydrateExerciseAggregates({ ...session, ...body })
  week.sessions[sessionIndex] = updatedSession

  week.week_summary = recalculateWeekSummary(week.sessions)
  week.lift_progression = recalculateLiftProgression(week.sessions)

  await writeCurrentWeek(week)
  return Response.json(updatedSession, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
