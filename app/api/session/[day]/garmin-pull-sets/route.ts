import { readCurrentWeekDirect, writeCurrentWeek } from '@/lib/data'
import { fetchActivityStrengthSets, type GarminStrengthSet } from '@/lib/garmin'
import { deriveExerciseAggregates } from '@/lib/liveSession'
import type { Exercise, ExerciseGroup, Session, SetEntry } from '@/lib/schema'

export const dynamic = 'force-dynamic'

function flattenExercises(session: Session): Exercise[] {
  if (session.exercise_groups && session.exercise_groups.length > 0) {
    return session.exercise_groups.flatMap((g: ExerciseGroup) => g.exercises)
  }
  return session.exercises
}

function plannedRepsNumber(exercise: Exercise): number {
  const r = exercise.reps
  if (typeof r === 'number') return r
  const parsed = parseInt(String(r ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function applySetLog(exercise: Exercise, log: SetEntry[]): Exercise {
  const derived = deriveExerciseAggregates(exercise, log)
  return {
    ...exercise,
    set_log: log,
    actual_sets: derived.actual_sets,
    actual_reps: derived.actual_reps,
    actual_weight_kg: derived.actual_weight_kg,
    effort: derived.effort,
  }
}

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
  const pushedOrder = session.garmin_pushed_exercise_order
  if (!session.garmin_activity_id || !pushedOrder || pushedOrder.length === 0) {
    return Response.json(
      { error: 'Session has no linked Garmin activity or pushed-exercise order' },
      { status: 400 },
    )
  }

  const pulledSets = await fetchActivityStrengthSets(session.garmin_activity_id)
  if (!pulledSets) {
    return Response.json({ error: 'No strength set data found on the Garmin activity' }, { status: 404 })
  }

  // Match sets back to exercises by GARMIN CATEGORY/EXERCISE-NAME IDENTITY,
  // not by chronological position — a naive "next N sets belong to exercise
  // N" chunking breaks for supersets, where two exercises' sets physically
  // interleave (A, B, A, B, ...) rather than running back-to-back.
  const queuesByKey = new Map<string, GarminStrengthSet[]>()
  for (const s of pulledSets) {
    const key = `${s.category ?? ''}::${s.exerciseName ?? ''}`
    const q = queuesByKey.get(key) ?? []
    q.push(s)
    queuesByKey.set(key, q)
  }

  const flat = flattenExercises(session)
  const matchedExercises: Exercise[] = []
  let flatIdx = 0
  for (const pushed of pushedOrder) {
    while (flatIdx < flat.length && flat[flatIdx].name !== pushed.name) flatIdx++
    if (flatIdx >= flat.length) break
    matchedExercises.push(flat[flatIdx])
    flatIdx++
  }

  const setLogsByExercise = new Map<Exercise, SetEntry[]>()
  for (let i = 0; i < pushedOrder.length && i < matchedExercises.length; i++) {
    const pushed = pushedOrder[i]
    const exercise = matchedExercises[i]
    const key = `${pushed.garminCategory}::${pushed.garminExerciseName}`
    const queue = queuesByKey.get(key) ?? []
    const chunk = queue.splice(0, pushed.sets)
    // Garmin's motion-based rep counter is unreliable (confirmed by live
    // test — same set sometimes counted, sometimes not, sometimes asked for
    // manual confirmation, sometimes not) — trust the PLANNED rep count
    // instead. Weight, which is manually entered on the watch, is trustworthy.
    const plannedReps = plannedRepsNumber(exercise)
    setLogsByExercise.set(
      exercise,
      chunk.map((s) => ({
        reps: plannedReps,
        weight_kg: s.weight_kg,
        effort: null,
        completed_at: new Date().toISOString(),
      })),
    )
  }

  function updateIfMatched(exercise: Exercise): Exercise {
    const log = setLogsByExercise.get(exercise)
    return log && log.length > 0 ? applySetLog(exercise, log) : exercise
  }

  const updatedSession: Session =
    session.exercise_groups && session.exercise_groups.length > 0
      ? (() => {
          const exercise_groups = session.exercise_groups!.map((group) => ({
            ...group,
            exercises: group.exercises.map(updateIfMatched),
          }))
          return { ...session, exercise_groups, exercises: exercise_groups.flatMap((g) => g.exercises) }
        })()
      : { ...session, exercises: session.exercises.map(updateIfMatched) }

  updatedSession.garmin_pull_status = 'pulled'
  week.sessions[sessionIndex] = updatedSession
  await writeCurrentWeek(week)

  return Response.json(updatedSession, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
