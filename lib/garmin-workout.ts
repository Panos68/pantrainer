import { createClient } from './garmin'
import { readGarminExerciseMap, normalizeExerciseName } from './data'
import type { Session, Exercise, ExerciseGroup, GarminExerciseMapEntry } from './schema'

// Real Garmin workout-step shapes confirmed live (Phase 0 spike, 2026-08-03) via
// `client.getWorkoutDetail`. Values below match what Garmin Connect itself produces —
// not guessed. See docs/superpowers/specs for the raw JSON dumps.
const STEP_TYPE = {
  warmup: { stepTypeId: 1, stepTypeKey: 'warmup', displayOrder: 1 },
  interval: { stepTypeId: 3, stepTypeKey: 'interval', displayOrder: 3 },
  rest: { stepTypeId: 5, stepTypeKey: 'rest', displayOrder: 5 },
  repeat: { stepTypeId: 6, stepTypeKey: 'repeat', displayOrder: 6 },
}
const END_CONDITION = {
  lapButton: { conditionTypeId: 1, conditionTypeKey: 'lap.button', displayOrder: 1, displayable: true },
  time: { conditionTypeId: 2, conditionTypeKey: 'time', displayOrder: 2, displayable: true },
  reps: { conditionTypeId: 10, conditionTypeKey: 'reps', displayOrder: 10, displayable: true },
  iterations: { conditionTypeId: 7, conditionTypeKey: 'iterations', displayOrder: 7, displayable: false },
}
const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target', displayOrder: 1 }
const NO_STROKE = { strokeTypeId: 0, strokeTypeKey: null, displayOrder: 0 }
const NO_EQUIPMENT = { equipmentTypeId: 0, equipmentTypeKey: null, displayOrder: 0 }
const KG_UNIT = { unitId: 8, unitKey: 'kilogram', factor: 1000 }
const STRENGTH_SPORT_TYPE = { sportTypeId: 5, sportTypeKey: 'strength_training', displayOrder: 5 }
const DEFAULT_REST_SEC = 90

let stepIdCounter = 0
function nextStepId(): number {
  // Garmin assigns real stepIds server-side; any distinct placeholder works for a new workout.
  stepIdCounter += 1
  return stepIdCounter
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseExecutableStep(overrides: Record<string, any>) {
  return {
    type: 'ExecutableStepDTO',
    stepId: nextStepId(),
    childStepId: null,
    description: null,
    preferredEndConditionUnit: null,
    endConditionCompare: null,
    targetType: NO_TARGET,
    targetValueOne: null,
    targetValueTwo: 0,
    targetValueUnit: null,
    zoneNumber: null,
    secondaryTargetType: null,
    secondaryTargetValueOne: null,
    secondaryTargetValueTwo: null,
    secondaryTargetValueUnit: null,
    secondaryZoneNumber: null,
    endConditionZone: null,
    strokeType: NO_STROKE,
    equipmentType: NO_EQUIPMENT,
    workoutProvider: null,
    providerExerciseSourceId: null,
    weightUnit: KG_UNIT,
    ...overrides,
  }
}

function exerciseStep(
  mapping: GarminExerciseMapEntry,
  reps: number,
  weightKg: number | null,
  isWarmup: boolean
) {
  return baseExecutableStep({
    stepOrder: 0, // overwritten by assignStepOrder's tree-wide sequential pass
    stepType: isWarmup ? STEP_TYPE.warmup : STEP_TYPE.interval,
    endCondition: END_CONDITION.reps,
    endConditionValue: reps,
    category: mapping.garminCategory,
    exerciseName: mapping.garminExerciseName,
    weightValue: weightKg != null ? weightKg : null,
  })
}

function restStep(restSec: number) {
  return baseExecutableStep({
    stepOrder: 0,
    stepType: STEP_TYPE.rest,
    endCondition: restSec > 0 ? END_CONDITION.time : END_CONDITION.lapButton,
    endConditionValue: restSec > 0 ? restSec : 0,
    category: null,
    exerciseName: null,
    weightValue: null,
  })
}

function repsOf(exercise: Exercise): number {
  const r = exercise.reps
  if (typeof r === 'number') return r
  const parsed = parseInt(String(r ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

// `skipLastRestStep` on RepeatGroupDTO turned out to not be honored (confirmed
// by live test — the trailing rest still played/showed). Instead we avoid a
// trailing rest structurally: repeat only the first (sets-1) rounds with a
// rest, then a final standalone last set with no rest attached at all. Any
// rest *between* this exercise and the next is then added once, by the caller.
function buildExerciseSteps(
  exercise: Exercise,
  mapping: GarminExerciseMapEntry,
  restBetweenSetsSec: number,
  isWarmup: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  const sets = exercise.sets ?? 1
  const reps = repsOf(exercise)
  const lastSet = exerciseStep(mapping, reps, exercise.weight_kg ?? null, isWarmup)

  if (sets <= 1) return [lastSet]

  const leadingRounds = sets - 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: any[] = [
    {
      type: 'RepeatGroupDTO',
      stepId: nextStepId(),
      stepOrder: 0,
      stepType: STEP_TYPE.repeat,
      childStepId: 1,
      numberOfIterations: leadingRounds,
      workoutSteps: [
        exerciseStep(mapping, reps, exercise.weight_kg ?? null, isWarmup),
        restStep(restBetweenSetsSec),
      ],
      endConditionValue: leadingRounds,
      preferredEndConditionUnit: null,
      endConditionCompare: null,
      endCondition: END_CONDITION.iterations,
      skipLastRestStep: null,
      smartRepeat: false,
    },
    lastSet,
  ]
  return steps
}

export type PushedExercise = { name: string; sets: number }

export type BuildResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  skippedExercises: string[]
  pushedExerciseOrder: PushedExercise[]
}

export function buildStrengthWorkoutPayload(
  session: Session,
  mapping: Record<string, GarminExerciseMapEntry>
): BuildResult {
  const groups: ExerciseGroup[] =
    session.exercise_groups && session.exercise_groups.length > 0
      ? session.exercise_groups
      : [
          {
            group_id: 'flat',
            label: session.type,
            type: 'straight',
            exercises: session.exercises,
          },
        ]

  const skippedExercises: string[] = []
  const pushedExerciseOrder: PushedExercise[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workoutSteps: any[] = []

  for (const group of groups) {
    const isWarmup = group.type === 'warmup' || group.type === 'cooldown'
    const isSuperset = group.type === 'superset'
    const restBetweenSets = group.rest_between_sets_sec ?? DEFAULT_REST_SEC
    const restBetweenExercises = group.rest_between_exercises_sec ?? DEFAULT_REST_SEC

    const mappedExercises: Array<{ exercise: Exercise; entry: GarminExerciseMapEntry }> = []
    for (const exercise of group.exercises) {
      const entry = mapping[normalizeExerciseName(exercise.name)]
      if (!entry) {
        skippedExercises.push(exercise.name)
        continue
      }
      mappedExercises.push({ exercise, entry })
    }
    if (mappedExercises.length === 0) continue

    if (isSuperset) {
      // A real superset is ONE shared repeat group: each round runs every
      // exercise back-to-back, with a single rest step at the end of the
      // round — not a separate rest (or repeat wrapper) per exercise.
      const roundSets = Math.max(...mappedExercises.map(({ exercise }) => exercise.sets ?? 1))
      mappedExercises.forEach(({ exercise }) =>
        pushedExerciseOrder.push({ name: exercise.name, sets: roundSets })
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roundSteps: any[] = mappedExercises.map(({ exercise, entry }) =>
        exerciseStep(entry, repsOf(exercise), exercise.weight_kg ?? null, isWarmup)
      )
      roundSteps.push(restStep(restBetweenSets))
      workoutSteps.push({
        type: 'RepeatGroupDTO',
        stepId: nextStepId(),
        stepOrder: 0,
        stepType: STEP_TYPE.repeat,
        childStepId: 1,
        numberOfIterations: roundSets,
        workoutSteps: roundSteps,
        endConditionValue: roundSets,
        preferredEndConditionUnit: null,
        endConditionCompare: null,
        endCondition: END_CONDITION.iterations,
        skipLastRestStep: null,
        smartRepeat: false,
      })
      continue
    }

    mappedExercises.forEach(({ exercise, entry }, i) => {
      const isLastInGroup = i === mappedExercises.length - 1
      pushedExerciseOrder.push({ name: exercise.name, sets: exercise.sets ?? 1 })
      workoutSteps.push(...buildExerciseSteps(exercise, entry, restBetweenSets, isWarmup))
      if (!isLastInGroup) {
        workoutSteps.push(restStep(restBetweenExercises))
      }
    })
  }

  // Garmin expects a single sequential stepOrder across the ENTIRE tree —
  // including each RepeatGroupDTO's nested children, not just the top level.
  // Duplicate/placeholder stepOrder values (e.g. all left at 0) cause Garmin's
  // backend to silently drop all but one nested child when the workout is saved.
  let order = 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function assignStepOrder(step: any) {
    step.stepOrder = order++
    if (step.type === 'RepeatGroupDTO') {
      for (const child of step.workoutSteps) assignStepOrder(child)
    }
  }
  workoutSteps.forEach(assignStepOrder)

  const payload = {
    workoutName: `${session.day} ${session.type}`.trim(),
    description: null,
    sportType: STRENGTH_SPORT_TYPE,
    subSportType: 'GENERIC',
    estimatedDurationInSecs: 0,
    estimatedDistanceInMeters: 0,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: STRENGTH_SPORT_TYPE,
        workoutSteps,
      },
    ],
  }

  return { payload, skippedExercises, pushedExerciseOrder }
}

export type PushResult = {
  workoutId: number
  skippedExercises: string[]
  pushedExerciseOrder: PushedExercise[]
}

export async function pushWorkoutToGarmin(session: Session): Promise<PushResult> {
  const mapping = await readGarminExerciseMap()
  const { payload, skippedExercises, pushedExerciseOrder } = buildStrengthWorkoutPayload(session, mapping)
  if (pushedExerciseOrder.length === 0) {
    throw new Error('No exercises in this session have a Garmin mapping — nothing to push')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = await createClient()
  const created = await client.addWorkout(payload)

  // Puts the workout directly on the right calendar day, not just in the
  // workout library — confirmed via python-garminconnect's schedule_workout,
  // since the npm client has no wrapper for this endpoint.
  const base = client.url.GC_API
  await client.client.post(`${base}/workout-service/schedule/${created.workoutId}`, { date: session.date })

  return { workoutId: created.workoutId, skippedExercises, pushedExerciseOrder }
}
