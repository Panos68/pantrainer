import assert from 'node:assert/strict'
import {
  nameToKey,
  updateLiftProgression,
  progressionFromCompletedStrengthSessions,
  liftsForWeek,
  excludedLiftWeights,
} from './progression'
import type { Exercise, Session, WeekDoc } from './schema'

function ex(name: string, actual_weight_kg: number, extra: Partial<Exercise> = {}): Exercise {
  return { name, actual_weight_kg, alternatives: [], ...extra } as Exercise
}

function session(date: string, exercises: Exercise[], extra: Partial<Session> = {}): Session {
  return {
    date,
    day: 'Monday',
    type: 'Strength',
    status: 'completed',
    exercises,
    photos: [],
    muscle_groups: [],
    ...extra,
  } as Session
}

function testBarbellKeysUnchanged() {
  // Existing chart keys must keep resolving exactly as before so history stays continuous.
  assert.equal(nameToKey('Push Press'), 'push_press_kg')
  assert.equal(nameToKey('Barbell Push Press'), 'push_press_kg')
  assert.equal(nameToKey('Overhead Press'), 'push_press_kg')
  assert.equal(nameToKey('OHP'), 'push_press_kg')
  assert.equal(nameToKey('Bench Press'), 'bench_press_kg')
  assert.equal(nameToKey('Barbell Bench Press'), 'bench_press_kg')
  assert.equal(nameToKey('Deadlift'), 'deadlift_kg')
  assert.equal(nameToKey('Romanian Deadlift'), 'romanian_deadlift_kg')
  assert.equal(nameToKey('Weighted Pull-ups'), 'weighted_pullups_added_kg')
  assert.equal(nameToKey('Dumbbell Bench Press'), 'sunday_db_bench_kg')
  assert.equal(nameToKey('DB Bench Press'), 'sunday_db_bench_kg')
  assert.equal(nameToKey('Incline Dumbbell Bench'), 'incline_db_kg')
}

function testEquipmentVariantsGetOwnSeries() {
  assert.equal(nameToKey('Dumbbell Push Press'), 'db_push_press_kg')
  assert.equal(nameToKey('DB Push Press'), 'db_push_press_kg')
  assert.equal(nameToKey('Dumbell Overhead Press'), 'db_push_press_kg')
  assert.equal(nameToKey('Seated DB OHP'), 'db_push_press_kg')
  assert.equal(nameToKey('Kettlebell Push Press'), 'kb_push_press_kg')
  assert.equal(nameToKey('KB Push Press'), 'kb_push_press_kg')
  assert.equal(nameToKey('Machine Shoulder Press'), 'machine_shoulder_press_kg')
  assert.equal(nameToKey('Smith Machine Bench Press'), 'smith_bench_press_kg')
  assert.equal(nameToKey('Dumbbell Romanian Deadlift'), 'db_romanian_deadlift_kg')
  assert.equal(nameToKey('DB Deadlift'), 'db_deadlift_kg')
  assert.equal(nameToKey('Single-arm Landmine Press'), 'single_arm_landmine_press_kg')
}

function testExcludedExerciseDoesNotUpdate() {
  const result = updateLiftProgression(
    [ex('Push Press', 40, { exclude_from_progress: true })],
    { push_press_kg: 60 },
  )
  assert.equal(result.push_press_kg, 60)
}

function testExcludedSessionDoesNotUpdate() {
  const sessions = [
    session('2026-01-05', [ex('Push Press', 60)]),
    session('2026-01-07', [ex('Push Press', 30)], { exclude_from_progress: true }),
  ]
  assert.equal(progressionFromCompletedStrengthSessions(sessions).push_press_kg, 60)
}

function testDumbbellDoesNotOverwriteBarbell() {
  const sessions = [
    session('2026-01-05', [ex('Push Press', 60)]),
    session('2026-01-07', [ex('Dumbbell Push Press', 22)]),
  ]
  const p = progressionFromCompletedStrengthSessions(sessions)
  assert.equal(p.push_press_kg, 60)
  assert.equal(p.db_push_press_kg, 22)
}

function week(sessions: Session[], lift_progression: Record<string, number> = {}): WeekDoc {
  return { sessions, lift_progression } as unknown as WeekDoc
}

function testLiftsForWeekDerivesFromSessions() {
  // A stale stored value (written by the old matcher) must not win over the sessions.
  const w = week([session('2026-01-05', [ex('Dumbbell Push Press', 22)])], { push_press_kg: 22 })
  assert.deepEqual(liftsForWeek(w), { db_push_press_kg: 22 })
}

function testLiftsForWeekFallsBackToStoredWhenNoStrengthLogged() {
  const w = week([], { push_press_kg: 60, note: 'x' } as unknown as Record<string, number>)
  assert.deepEqual(liftsForWeek(w), { push_press_kg: 60 })
}

function testExcludedLiftWeightsCollectsOnlyExcluded() {
  const sessions = [
    session('2026-01-05', [ex('Push Press', 60), ex('Deadlift', 100, { exclude_from_progress: true })]),
    session('2026-01-07', [ex('Push Press', 35), ex('Push Press', 40)], { exclude_from_progress: true }),
  ]
  assert.deepEqual(excludedLiftWeights(sessions), { deadlift_kg: 100, push_press_kg: 40 })
}

testBarbellKeysUnchanged()
testExcludedLiftWeightsCollectsOnlyExcluded()
testEquipmentVariantsGetOwnSeries()
testExcludedExerciseDoesNotUpdate()
testExcludedSessionDoesNotUpdate()
testDumbbellDoesNotOverwriteBarbell()
testLiftsForWeekDerivesFromSessions()
testLiftsForWeekFallsBackToStoredWhenNoStrengthLogged()
console.log('progression tests passed')
