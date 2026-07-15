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
      side?: 'left' | 'right'
    }
  | { kind: 'rest'; seconds: number }

export const DEFAULT_REST_SEC = 60

export function plannedSetCount(ex: Exercise): number {
  return ex.sets ?? 1
}

// Expands a single 'set' step into two side-tagged steps (left, right) when the
// exercise is marked per_side; otherwise returns the step unchanged.
function expandForSide(step: LiveStep): LiveStep[] {
  if (step.kind !== 'set' || !step.exercise.per_side) return [step]
  return [
    { ...step, side: 'left' },
    { ...step, side: 'right' },
  ]
}

function buildStraightSteps(group: ExerciseGroup, exerciseIndex: number, ex: Exercise): LiveStep[] {
  const total = plannedSetCount(ex)
  const steps: LiveStep[] = []
  for (let i = 0; i < total; i++) {
    steps.push(
      ...expandForSide({
        kind: 'set',
        groupId: group.group_id,
        exerciseIndex,
        exercise: ex,
        setNumber: i + 1,
        totalSets: total,
        roundNumber: null,
        totalRounds: null,
      }),
    )
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
      steps.push(
        ...expandForSide({
          kind: 'set',
          groupId: group.group_id,
          exerciseIndex: exerciseIndexOffset + i,
          exercise: ex,
          setNumber: round + 1,
          totalSets: rounds,
          roundNumber: round + 1,
          totalRounds: rounds,
        }),
      )
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
        steps.push(
          ...expandForSide({
            kind: 'set',
            groupId: null,
            exerciseIndex,
            exercise: ex,
            setNumber: i + 1,
            totalSets: total,
            roundNumber: null,
            totalRounds: null,
          }),
        )
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

export function getResumeIndex(queue: LiveStep[], loggedSets: Record<number, SetEntry[]>): number {
  const firstIncomplete = queue.findIndex((s) => {
    if (s.kind !== 'set') return false
    const log = loggedSets[s.exerciseIndex] ?? []
    const matchingSets = s.side != null ? log.filter((entry) => entry.side === s.side) : log
    return matchingSets.length < s.setNumber
  })
  return firstIncomplete === -1 ? queue.length : firstIncomplete
}

export const EFFORT_RANK: Record<Exclude<SetEntry['effort'], null>, number> = { perfect: 0, easy: 1, hard: 2 }

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

// Per-side aware aggregation: buckets sets by `side` and derives aggregates independently
// for left/right. Sets with no `side` tag (the common bilateral case) are ignored here —
// callers should use `deriveAggregates` for those. A side with no logged sets returns null.
export function deriveAggregatesPerSide(sets: SetEntry[]): {
  left: ReturnType<typeof deriveAggregates> | null
  right: ReturnType<typeof deriveAggregates> | null
} {
  const left = sets.filter((s) => s.side === 'left')
  const right = sets.filter((s) => s.side === 'right')
  return {
    left: left.length > 0 ? deriveAggregates(left) : null,
    right: right.length > 0 ? deriveAggregates(right) : null,
  }
}

export function deriveExerciseAggregates(exercise: Exercise, sets: SetEntry[]): ReturnType<typeof deriveAggregates> {
  if (!exercise.per_side) return deriveAggregates(sets)

  const perSide = deriveAggregatesPerSide(sets)
  const sides = [perSide.left, perSide.right].filter((side) => side != null)
  if (sides.length === 0) return deriveAggregates(sets)

  const last = sets[sets.length - 1]
  const weightValues = sides
    .map((side) => side.actual_weight_kg)
    .filter((weight): weight is number => weight != null)

  return {
    actual_sets: Math.max(...sides.map((side) => side.actual_sets)),
    actual_reps: last.reps,
    actual_weight_kg: weightValues.length > 0 ? Math.min(...weightValues) : null,
    effort: sides.reduce(
      (acc, side) =>
        side.effort != null && (acc == null || EFFORT_RANK[side.effort] > EFFORT_RANK[acc])
          ? side.effort
          : acc,
      null as SetEntry['effort'],
    ),
  }
}

// Applies a direct edit of the Sets/Reps/Weight/Effort table cells to the underlying
// set_log — the reverse direction of the live flow. Pads/truncates `existing` to match
// the requested set count, applies the edited values to the *last* entry (matching the
// "last set defines aggregate" semantics used by deriveAggregates), and leaves earlier
// entries untouched.
export function applyTableEditToSetLog(
  existing: SetEntry[],
  edit: { sets: number; reps: number; weight_kg: number | null; effort: SetEntry['effort'] },
): SetEntry[] {
  const targetCount = Math.max(0, Math.floor(edit.sets))
  const result: SetEntry[] = existing.slice(0, targetCount).map((s) => ({ ...s }))

  while (result.length < targetCount) {
    const template = result[result.length - 1] ?? existing[existing.length - 1]
    result.push(
      template
        ? { ...template }
        : { reps: edit.reps, weight_kg: edit.weight_kg, effort: edit.effort, completed_at: new Date().toISOString() },
    )
  }

  if (result.length > 0) {
    const last = result[result.length - 1]
    result[result.length - 1] = {
      ...last,
      reps: edit.reps,
      weight_kg: edit.weight_kg,
      effort: edit.effort,
    }
  }

  return result
}

export function applyPerSideTableEditToSetLog(
  existing: SetEntry[],
  edit: { sets: number; reps: number; weight_kg: number | null; effort: SetEntry['effort'] },
): SetEntry[] {
  const targetCount = Math.max(0, Math.floor(edit.sets))
  const now = new Date().toISOString()
  const bySide = {
    left: existing.filter((s) => s.side === 'left'),
    right: existing.filter((s) => s.side === 'right'),
  }

  function resizeSide(side: 'left' | 'right'): SetEntry[] {
    const sideEntries = bySide[side].slice(0, targetCount).map((s) => ({ ...s, side }))
    while (sideEntries.length < targetCount) {
      const template = sideEntries[sideEntries.length - 1] ?? bySide[side][bySide[side].length - 1]
      sideEntries.push(
        template
          ? { ...template, side }
          : { reps: edit.reps, weight_kg: edit.weight_kg, effort: edit.effort, completed_at: now, side },
      )
    }
    if (sideEntries.length > 0) {
      const lastIndex = sideEntries.length - 1
      sideEntries[lastIndex] = {
        ...sideEntries[lastIndex],
        reps: edit.reps,
        weight_kg: edit.weight_kg,
        effort: edit.effort,
        side,
      }
    }
    return sideEntries
  }

  const left = resizeSide('left')
  const right = resizeSide('right')
  const result: SetEntry[] = []
  for (let i = 0; i < targetCount; i++) {
    result.push(left[i], right[i])
  }
  return result
}

export function applyExerciseTableEditToSetLog(
  exercise: Exercise,
  existing: SetEntry[],
  edit: { sets: number; reps: number; weight_kg: number | null; effort: SetEntry['effort'] },
): SetEntry[] {
  return exercise.per_side
    ? applyPerSideTableEditToSetLog(existing, edit)
    : applyTableEditToSetLog(existing, edit)
}

function planDefaultReps(plan: Exercise): number {
  if (typeof plan.reps === 'number') return plan.reps
  if (typeof plan.reps === 'string') {
    const timed = parseTimedSeconds(plan.reps)
    if (timed != null) return timed
    const parsed = parseInt(plan.reps, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

// Returns defaults to pre-fill the next set during the live flow: the previous logged
// set's reps/weight if one exists, else a default derived from today's plan.
export function getCarryForwardDefaults(
  loggedSets: SetEntry[],
  plan: Exercise,
  side?: 'left' | 'right' | null,
): { reps: number; weight_kg: number | null } {
  const candidates = side != null ? loggedSets.filter((s) => s.side === side) : loggedSets
  const prev = candidates[candidates.length - 1]
  if (prev) {
    return { reps: prev.reps, weight_kg: prev.weight_kg }
  }
  return { reps: planDefaultReps(plan), weight_kg: plan.weight_kg ?? null }
}

// Matches strings like "30 sec", "45sec", "1 min" used for timed exercises (e.g. dead hang, plank).
export function parseTimedSeconds(reps: number | string | null | undefined): number | null {
  if (typeof reps !== 'string') return null
  const match = reps.match(/(\d+(?:\.\d+)?)\s*(sec|min)/i)
  if (!match) return null
  const value = parseFloat(match[1])
  return match[2].toLowerCase() === 'min' ? Math.round(value * 60) : Math.round(value)
}
