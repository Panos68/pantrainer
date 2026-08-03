import { readCurrentWeekDirect, writeCurrentWeek } from '@/lib/data'
import { pushWorkoutToGarmin } from '@/lib/garmin-workout'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
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
  if (session.type !== 'Strength') {
    return Response.json({ error: 'Only Strength sessions can be pushed to Garmin' }, { status: 400 })
  }

  let result
  try {
    result = await pushWorkoutToGarmin(session)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Garmin push failed' },
      { status: 502 },
    )
  }

  const updatedSession = {
    ...session,
    garmin_workout_id: result.workoutId,
    garmin_pushed_exercise_order: result.pushedExerciseOrder,
    garmin_push_skipped: result.skippedExercises,
    garmin_pull_status: 'pushed' as const,
  }
  week.sessions[sessionIndex] = updatedSession
  await writeCurrentWeek(week)

  return Response.json(updatedSession, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
