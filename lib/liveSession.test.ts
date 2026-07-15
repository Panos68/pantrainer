import assert from 'node:assert/strict'
import {
  buildLiveQueue,
  deriveAggregates,
  applyTableEditToSetLog,
  getCarryForwardDefaults,
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

function testGetCarryForwardDefaultsFromLoggedSets() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const logged: SetEntry[] = [
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 7, weight_kg: 62.5, effort: 'hard', completed_at: 't2' },
  ]
  const defaults = getCarryForwardDefaults(logged, plan)
  assert.deepEqual(defaults, { reps: 7, weight_kg: 62.5 }, 'uses the previous logged set when present')
}

function testGetCarryForwardDefaultsFromPlan() {
  const plan = { name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }
  const defaults = getCarryForwardDefaults([], plan)
  assert.deepEqual(defaults, { reps: 8, weight_kg: 60 }, 'falls back to plan-derived default with no logged sets')

  const timedPlan = { name: 'Plank', sets: 3, reps: '45 sec', weight_kg: null, alternatives: [] }
  const timedDefaults = getCarryForwardDefaults([], timedPlan)
  assert.deepEqual(timedDefaults, { reps: 45, weight_kg: null }, 'parses timed reps strings for the plan default')
}

testStraightSets()
testSupersetRounds()
testDeriveAggregates()
testPerSideStraightQueue()
testPerSideSupersetQueue()
testApplyTableEditToSetLogPads()
testApplyTableEditToSetLogTruncates()
testApplyTableEditToSetLogFromEmpty()
testGetCarryForwardDefaultsFromLoggedSets()
testGetCarryForwardDefaultsFromPlan()
console.log('lib/liveSession.test.ts: all assertions passed')
