import assert from 'node:assert/strict'
import { buildLiveQueue, deriveAggregates } from './liveSession'
import type { Session } from './schema'

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

testStraightSets()
testSupersetRounds()
testDeriveAggregates()
console.log('lib/liveSession.test.ts: all assertions passed')
