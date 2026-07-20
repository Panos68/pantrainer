import assert from 'node:assert/strict'
import {
  buildLiveQueue,
  deriveAggregates,
  deriveExerciseAggregates,
  applyTableEditToSetLog,
  applyExerciseTableEditToSetLog,
  getCarryForwardDefaults,
  getResumeIndex,
} from './liveSession'
import type { Session, SetEntry } from './schema'

function baseSession(overrides: Partial<Session>): Session {
  return {
    date: '2026-07-14',
    day: 'Monday',
    type: 'Strength',
    exercises: [],
    status: 'planned',
    photos: [],
    muscle_groups: [],
    ...overrides,
  } as Session
}

function testStraightSets() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Main',
        type: 'straight',
        rest_between_sets_sec: 90,
        exercises: [{ name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const kinds = queue.map((s) => s.kind)
  assert.deepEqual(kinds, ['set', 'rest', 'set', 'rest', 'set'], 'straight: set/rest pattern, no trailing rest')
  const rest = queue[1]
  assert.equal(rest.kind === 'rest' && rest.seconds, 90, 'straight: uses rest_between_sets_sec')
}

function testSupersetRounds() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Superset A',
        type: 'superset',
        rest_between_sets_sec: 90,
        rest_between_exercises_sec: 15,
        exercises: [
          { name: 'DB Row', sets: 2, reps: 10, weight_kg: 20, alternatives: [] },
          { name: 'Push Up', sets: 2, reps: 12, weight_kg: null, alternatives: [] },
        ],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const summary = queue.map((s) => (s.kind === 'set' ? `set:${s.exercise.name}` : `rest:${s.seconds}`))
  assert.deepEqual(summary, [
    'set:DB Row', 'rest:15', 'set:Push Up', 'rest:90',
    'set:DB Row', 'rest:15', 'set:Push Up',
  ], 'superset: alternates within round, correct rest durations, no trailing rest')
}

function testDeriveAggregates() {
  const result = deriveAggregates([
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 7, weight_kg: 60, effort: 'hard', completed_at: 't2' },
  ])
  assert.deepEqual(result, { actual_sets: 2, actual_reps: 7, actual_weight_kg: 60, effort: 'hard' })

  const effortOnly = deriveAggregates([
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 8, weight_kg: 60, effort: 'easy', completed_at: 't2' },
  ])
  assert.equal(effortOnly.effort, 'easy', 'prefers easy over perfect')
}

function testDeriveExerciseAggregatesPerSide() {
  const exercise = { name: 'Split Squat', sets: 2, reps: 8, weight_kg: 20, alternatives: [], per_side: true }
  const result = deriveExerciseAggregates(exercise, [
    { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't1', side: 'left' },
    { reps: 8, weight_kg: 20, effort: 'easy', completed_at: 't2', side: 'right' },
    { reps: 7, weight_kg: 22, effort: 'hard', completed_at: 't3', side: 'left' },
    { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't4', side: 'right' },
  ])
  assert.deepEqual(
    result,
    { actual_sets: 2, actual_reps: 8, actual_weight_kg: 20, effort: 'hard' },
    'per-side aggregate counts paired sets once, keeps the conservative side weight, and preserves worst effort',
  )
}

function testPerSideStraightQueue() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Main',
        type: 'straight',
        rest_between_sets_sec: 90,
        exercises: [{ name: 'Bulgarian Split Squat', sets: 2, reps: 8, weight_kg: 20, alternatives: [], per_side: true }],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const setSteps = queue.filter((s) => s.kind === 'set') as Extract<typeof queue[number], { kind: 'set' }>[]
  assert.equal(setSteps.length, 4, 'per_side: each planned set becomes two queue entries')
  assert.deepEqual(setSteps.map((s) => s.side), ['left', 'right', 'left', 'right'], 'per_side: left then right per set')
  assert.deepEqual(setSteps.map((s) => s.setNumber), [1, 1, 2, 2], 'per_side: same setNumber for both sides')
  // rest still appears only once between sets (not doubled per side)
  assert.deepEqual(queue.map((s) => s.kind), ['set', 'set', 'rest', 'set', 'set'], 'per_side: single rest between set pairs')
}

function testResumeIndexPerSide() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Main',
        type: 'straight',
        rest_between_sets_sec: 90,
        exercises: [{ name: 'Bulgarian Split Squat', sets: 2, reps: 8, weight_kg: 20, alternatives: [], per_side: true }],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  assert.equal(
    getResumeIndex(queue, {
      0: [{ reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't1', side: 'left' }],
    }),
    1,
    'resumes at right side of set 1 after only left side was logged',
  )
  assert.equal(
    getResumeIndex(queue, {
      0: [
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't1', side: 'left' },
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't2', side: 'right' },
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't3', side: 'left' },
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't4', side: 'right' },
      ],
    }),
    queue.length,
    'fully logged per-side sessions resume to the review screen',
  )
}

function testPerSideSupersetQueue() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Superset A',
        type: 'superset',
        rest_between_sets_sec: 90,
        rest_between_exercises_sec: 15,
        exercises: [
          { name: 'Single Leg RDL', sets: 1, reps: 8, weight_kg: 20, alternatives: [], per_side: true },
          { name: 'Push Up', sets: 1, reps: 12, weight_kg: null, alternatives: [] },
        ],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const summary = queue.map((s) =>
    s.kind === 'set' ? `set:${s.exercise.name}:${s.side ?? 'na'}` : `rest:${s.seconds}`,
  )
  assert.deepEqual(summary, [
    'set:Single Leg RDL:left', 'set:Single Leg RDL:right', 'rest:15', 'set:Push Up:na',
  ], 'per_side: superset expands only the per_side exercise into left/right')
}

function testApplyTableEditToSetLogPads() {
  const existing: SetEntry[] = [
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
  ]
  const result = applyTableEditToSetLog(existing, { sets: 3, reps: 10, weight_kg: 65, effort: 'hard' })
  assert.equal(result.length, 3, 'pads to requested set count')
  assert.deepEqual(result[0], existing[0], 'earlier entries untouched')
  assert.deepEqual(result[1], existing[0], 'padded entry copies the last known entry')
  assert.deepEqual(
    { reps: result[2].reps, weight_kg: result[2].weight_kg, effort: result[2].effort },
    { reps: 10, weight_kg: 65, effort: 'hard' },
    'edited values applied to the last entry',
  )
}

function testApplyTableEditToSetLogTruncates() {
  const existing: SetEntry[] = [
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 8, weight_kg: 60, effort: 'easy', completed_at: 't2' },
    { reps: 8, weight_kg: 60, effort: 'hard', completed_at: 't3' },
  ]
  const result = applyTableEditToSetLog(existing, { sets: 2, reps: 5, weight_kg: 50, effort: 'easy' })
  assert.equal(result.length, 2, 'truncates to requested set count')
  assert.deepEqual(result[0], existing[0], 'earlier entries untouched')
  assert.deepEqual(
    { reps: result[1].reps, weight_kg: result[1].weight_kg, effort: result[1].effort },
    { reps: 5, weight_kg: 50, effort: 'easy' },
    'edited values applied to the new last entry',
  )
}

function testApplyTableEditToSetLogFromEmpty() {
  const result = applyTableEditToSetLog([], { sets: 2, reps: 12, weight_kg: null, effort: 'perfect' })
  assert.equal(result.length, 2, 'builds fresh entries when there is no existing log')
  assert.equal(result[1].reps, 12)
  assert.equal(result[1].weight_kg, null)
  assert.equal(result[1].effort, 'perfect')
}

function testApplyExerciseTableEditToSetLogPerSide() {
  const exercise = { name: 'Split Squat', sets: 2, reps: 8, weight_kg: 20, alternatives: [], per_side: true }
  const result = applyExerciseTableEditToSetLog(
    exercise,
    [
      { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: 't1', side: 'left' },
      { reps: 8, weight_kg: 20, effort: 'easy', completed_at: 't2', side: 'right' },
    ],
    { sets: 2, reps: 9, weight_kg: 22, effort: 'hard' },
  )
  assert.deepEqual(
    result.map((entry) => entry.side),
    ['left', 'right', 'left', 'right'],
    'per-side table edits preserve the left/right pair structure',
  )
  assert.deepEqual(
    result.map((entry) => entry.reps),
    [8, 8, 9, 9],
    'per-side table edits apply edited reps to the last pair only',
  )
  assert.deepEqual(
    result.map((entry) => entry.weight_kg),
    [20, 20, 22, 22],
    'per-side table edits apply edited weight to the last pair only',
  )
}

function testGetCarryForwardDefaultsFromLoggedSets() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const logged: SetEntry[] = [
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 7, weight_kg: 62.5, effort: 'perfect', completed_at: 't2' },
  ]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 7, weight_kg: 62.5 }, 'perfect effort repeats the previous logged set verbatim')
}

function testGetCarryForwardDefaultsFromPlan() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const defaults = getCarryForwardDefaults([], plan)
  assert.deepEqual(defaults, { reps: 8, weight_kg: 60 }, 'falls back to plan-derived default with no logged sets')

  const timedPlan = { name: 'Plank', sets: 3, reps: '45 sec', weight_kg: null, alternatives: [] }
  const timedDefaults = getCarryForwardDefaults([], timedPlan)
  assert.deepEqual(timedDefaults, { reps: 45, weight_kg: null }, 'parses timed reps strings for the plan default')
}

function testGetCarryForwardDefaultsPerSideFiltersBySide() {
  const plan = { name: 'DB Curl', sets: 3, reps: 10, weight_kg: 10, alternatives: [], per_side: true }
  const logged: SetEntry[] = [
    { reps: 10, weight_kg: 10, effort: 'perfect', completed_at: 't1', side: 'left' },
    { reps: 10, weight_kg: 12, effort: 'perfect', completed_at: 't2', side: 'right' },
    { reps: 9, weight_kg: 10, effort: 'perfect', completed_at: 't3', side: 'left' },
  ]
  const leftDefaults = getCarryForwardDefaults(logged, plan, 'left')
  assert.deepEqual(
    leftDefaults,
    { reps: 9, weight_kg: 10 },
    'left side carries forward from the previous left entry, skipping the right entry logged in between',
  )

  const rightDefaults = getCarryForwardDefaults(logged, plan, 'right')
  assert.deepEqual(
    rightDefaults,
    { reps: 10, weight_kg: 12 },
    'right side carries forward from the previous right entry',
  )
}

function testGetCarryForwardDefaultsPerSideFallsBackToPlan() {
  const plan = { name: 'DB Curl', sets: 3, reps: 10, weight_kg: 10, alternatives: [], per_side: true }
  const logged: SetEntry[] = [{ reps: 10, weight_kg: 10, effort: 'perfect', completed_at: 't1', side: 'left' }]
  const rightDefaults = getCarryForwardDefaults(logged, plan, 'right')
  assert.deepEqual(
    rightDefaults,
    { reps: 10, weight_kg: 10 },
    'falls back to plan default when there is no prior entry for the requested side yet',
  )
}

function testGetCarryForwardDefaultsStepsUpOnEasyWeighted() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 8, weight_kg: 60, effort: 'easy', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 8, weight_kg: 62.5 }, 'easy weighted set steps weight up by 2.5kg, reps unchanged')
}

function testGetCarryForwardDefaultsStepsDownOnHardWeighted() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 8, weight_kg: 60, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 8, weight_kg: 57.5 }, 'hard weighted set steps weight down by 2.5kg, reps unchanged')
}

function testGetCarryForwardDefaultsWeightFloorsAtZero() {
  const plan = { name: 'Light Curl', sets: 3, reps: 10, weight_kg: 1, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 10, weight_kg: 1, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 10, weight_kg: 0 }, 'weight step-down floors at 0, never negative')
}

function testGetCarryForwardDefaultsStepsUpOnEasyTimed() {
  const plan = { name: 'Plank', sets: 3, reps: '45 sec', weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 45, weight_kg: null, effort: 'easy', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 50, weight_kg: null }, 'easy timed set steps seconds up by 5')
}

function testGetCarryForwardDefaultsStepsDownOnHardTimed() {
  const plan = { name: 'Plank', sets: 3, reps: '45 sec', weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 45, weight_kg: null, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 40, weight_kg: null }, 'hard timed set steps seconds down by 5')
}

function testGetCarryForwardDefaultsTimedFloorsAtFive() {
  const plan = { name: 'Plank', sets: 3, reps: '8 sec', weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 8, weight_kg: null, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 5, weight_kg: null }, 'timed step-down floors at 5 seconds')
}

function testGetCarryForwardDefaultsStepsUpOnEasyBodyweight() {
  const plan = { name: 'Push Up', sets: 3, reps: 12, weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 12, weight_kg: null, effort: 'easy', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 14, weight_kg: null }, 'easy bodyweight set steps reps up by 2')
}

function testGetCarryForwardDefaultsStepsDownOnHardBodyweight() {
  const plan = { name: 'Push Up', sets: 3, reps: 12, weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 12, weight_kg: null, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 10, weight_kg: null }, 'hard bodyweight set steps reps down by 2')
}

function testGetCarryForwardDefaultsBodyweightRepsFloorsAtOne() {
  const plan = { name: 'Pistol Squat', sets: 3, reps: 2, weight_kg: null, alternatives: [] }
  const logged: SetEntry[] = [{ reps: 2, weight_kg: null, effort: 'hard', completed_at: 't1' }]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 1, weight_kg: null }, 'bodyweight step-down floors at 1 rep')
}

function testGetCarryForwardDefaultsPerSideStepIsIndependent() {
  const plan = { name: 'DB Curl', sets: 3, reps: 10, weight_kg: 10, alternatives: [], per_side: true }
  const logged: SetEntry[] = [
    { reps: 10, weight_kg: 10, effort: 'easy', completed_at: 't1', side: 'left' },
    { reps: 10, weight_kg: 10, effort: 'hard', completed_at: 't2', side: 'right' },
  ]
  const leftDefaults = getCarryForwardDefaults(logged, plan, 'left')
  assert.deepEqual(leftDefaults, { reps: 10, weight_kg: 12.5 }, 'left side steps up from its own easy rating')

  const rightDefaults = getCarryForwardDefaults(logged, plan, 'right')
  assert.deepEqual(rightDefaults, { reps: 10, weight_kg: 7.5 }, 'right side steps down from its own hard rating, independent of left')
}

testStraightSets()
testSupersetRounds()
testDeriveAggregates()
testDeriveExerciseAggregatesPerSide()
testPerSideStraightQueue()
testResumeIndexPerSide()
testPerSideSupersetQueue()
testApplyTableEditToSetLogPads()
testApplyTableEditToSetLogTruncates()
testApplyTableEditToSetLogFromEmpty()
testApplyExerciseTableEditToSetLogPerSide()
testGetCarryForwardDefaultsFromLoggedSets()
testGetCarryForwardDefaultsFromPlan()
testGetCarryForwardDefaultsPerSideFiltersBySide()
testGetCarryForwardDefaultsPerSideFallsBackToPlan()
testGetCarryForwardDefaultsStepsUpOnEasyWeighted()
testGetCarryForwardDefaultsStepsDownOnHardWeighted()
testGetCarryForwardDefaultsWeightFloorsAtZero()
testGetCarryForwardDefaultsStepsUpOnEasyTimed()
testGetCarryForwardDefaultsStepsDownOnHardTimed()
testGetCarryForwardDefaultsTimedFloorsAtFive()
testGetCarryForwardDefaultsStepsUpOnEasyBodyweight()
testGetCarryForwardDefaultsStepsDownOnHardBodyweight()
testGetCarryForwardDefaultsBodyweightRepsFloorsAtOne()
testGetCarryForwardDefaultsPerSideStepIsIndependent()
console.log('lib/liveSession.test.ts: all assertions passed')
