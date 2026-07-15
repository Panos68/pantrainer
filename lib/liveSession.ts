import type { Exercise, ExerciseGroup, Session, SetEntry } from './schema'

export type LiveStep =
  | {
      kind: 'set'
      groupId: string | null
      exerciseIndex: number
      exercise: Exercise
      setNumber: number
      totalSets: number
      roundNumber: number | null
      totalRounds: number | null
    }
  | { kind: 'rest'; seconds: number }

const DEFAULT_REST_SEC = 60

function plannedSetCount(ex: Exercise): number {
  return ex.sets ?? 1
}

function buildStraightSteps(group: ExerciseGroup, exerciseIndex: number, ex: Exercise): LiveStep[] {
  const total = plannedSetCount(ex)
  const steps: LiveStep[] = []
  for (let i = 0; i < total; i++) {
    steps.push({
      kind: 'set',
      groupId: group.group_id,
      exerciseIndex,
      exercise: ex,
      setNumber: i + 1,
      totalSets: total,
      roundNumber: null,
      totalRounds: null,
    })
    if (i < total - 1) {
      steps.push({ kind: 'rest', seconds: group.rest_between_sets_sec ?? DEFAULT_REST_SEC })
    }
  }
  return steps
}

function buildSupersetSteps(group: ExerciseGroup, exerciseIndexOffset: number): LiveStep[] {
  const rounds = Math.max(...group.exercises.map(plannedSetCount), 1)
  const steps: LiveStep[] = []
  for (let round = 0; round < rounds; round++) {
    group.exercises.forEach((ex, i) => {
      steps.push({
        kind: 'set',
        groupId: group.group_id,
        exerciseIndex: exerciseIndexOffset + i,
        exercise: ex,
        setNumber: round + 1,
        totalSets: rounds,
        roundNumber: round + 1,
        totalRounds: rounds,
      })
      const isLastExerciseInRound = i === group.exercises.length - 1
      if (!isLastExerciseInRound) {
        steps.push({ kind: 'rest', seconds: group.rest_between_exercises_sec ?? DEFAULT_REST_SEC })
      } else if (round < rounds - 1) {
        steps.push({ kind: 'rest', seconds: group.rest_between_sets_sec ?? DEFAULT_REST_SEC })
      }
    })
  }
  return steps
}

export function buildLiveQueue(session: Session): LiveStep[] {
  const groups = session.exercise_groups
  if (!groups || groups.length === 0) {
    let exerciseIndex = 0
    const steps: LiveStep[] = []
    for (const ex of session.exercises) {
      const total = plannedSetCount(ex)
      for (let i = 0; i < total; i++) {
        steps.push({
          kind: 'set',
          groupId: null,
          exerciseIndex,
          exercise: ex,
          setNumber: i + 1,
          totalSets: total,
          roundNumber: null,
          totalRounds: null,
        })
        if (i < total - 1) steps.push({ kind: 'rest', seconds: DEFAULT_REST_SEC })
      }
      exerciseIndex++
    }
    return steps
  }

  const steps: LiveStep[] = []
  let exerciseIndex = 0
  for (const group of groups) {
    if (group.type === 'superset') {
      steps.push(...buildSupersetSteps(group, exerciseIndex))
      exerciseIndex += group.exercises.length
    } else {
      for (const ex of group.exercises) {
        steps.push(...buildStraightSteps(group, exerciseIndex, ex))
        exerciseIndex++
      }
    }
  }
  return steps
}

const EFFORT_RANK: Record<Exclude<SetEntry['effort'], null>, number> = { perfect: 0, easy: 1, hard: 2 }

export function deriveAggregates(sets: SetEntry[]): {
  actual_sets: number
  actual_reps: number
  actual_weight_kg: number | null
  effort: SetEntry['effort']
} {
  const last = sets[sets.length - 1]
  const worst = sets.reduce(
    (acc, s) => (s.effort != null && (acc == null || EFFORT_RANK[s.effort] > EFFORT_RANK[acc]) ? s.effort : acc),
    null as SetEntry['effort'],
  )
  return {
    actual_sets: sets.length,
    actual_reps: last.reps,
    actual_weight_kg: last.weight_kg,
    effort: worst,
  }
}

// Matches strings like "30 sec", "45sec", "1 min" used for timed exercises (e.g. dead hang, plank).
export function parseTimedSeconds(reps: number | string | null | undefined): number | null {
  if (typeof reps !== 'string') return null
  const match = reps.match(/(\d+(?:\.\d+)?)\s*(sec|min)/i)
  if (!match) return null
  const value = parseFloat(match[1])
  return match[2].toLowerCase() === 'min' ? Math.round(value * 60) : Math.round(value)
}
