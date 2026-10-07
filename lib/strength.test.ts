import assert from 'node:assert/strict'
import { applySetToRecords, computeRecords, detectPrs, e1rm, e1rmSeries, liftSetsFromSessions, trackedLifts } from './strength'
import type { Exercise, Session } from './schema'

function ex(name: string, sets: Array<[number, number]>, extra: Partial<Exercise> = {}): Exercise {
  return {
    name,
    alternatives: [],
    set_log: sets.map(([weight_kg, reps]) => ({ weight_kg, reps, effort: null, completed_at: 'x' })),
    ...extra,
  } as Exercise
}

function session(date: string, exercises: Exercise[], extra: Partial<Session> = {}): Session {
  return { date, day: 'Monday', type: 'Strength', status: 'completed', exercises, photos: [], muscle_groups: [], ...extra } as Session
}

function testE1rm() {
  assert.equal(e1rm(100, 1), 100)
  assert.equal(e1rm(100, 5), 116.7)
  assert.equal(e1rm(100, 13), null)
  assert.equal(e1rm(0, 5), null)
  assert.equal(e1rm(100, 0), null)
}

function testSetsUseLogAndFallBackToActuals() {
  const legacy = { name: 'Deadlift', alternatives: [], actual_weight_kg: 120, actual_reps: 5, actual_sets: 3 } as Exercise
  const sets = liftSetsFromSessions([
    session('2026-01-05', [ex('Push Press', [[60, 5], [60, 4]])]),
    session('2026-01-06', [legacy]),
    session('2026-01-07', [ex('Push Press', [[70, 3]])], { status: 'planned' }),
  ])
  assert.equal(sets.length, 5)
  assert.deepEqual(sets.filter((s) => s.key === 'deadlift_kg').map((s) => s.weight), [120, 120, 120])
}

function testRecordsSkipExcludedAndVariants() {
  const sets = liftSetsFromSessions([
    session('2026-01-05', [ex('Push Press', [[60, 5]])]),
    session('2026-01-07', [ex('Push Press', [[80, 1]])], { exclude_from_progress: true }),
    session('2026-01-08', [ex('Dumbbell Push Press', [[24, 8]])]),
  ])
  const records = computeRecords(sets)
  assert.equal(records.get('push_press_kg')?.bestWeight, 60)
  assert.equal(records.get('db_push_press_kg')?.bestWeight, 24)
}

function testDetectPrs() {
  const records = computeRecords(liftSetsFromSessions([
    session('2026-01-05', [ex('Bench Press', [[80, 5], [85, 2], [70, 8]])]),
  ]))
  const r = records.get('bench_press_kg')
  assert.deepEqual(detectPrs({ weight: 87.5, reps: 1 }, r), ['weight'])
  // 80x6 beats the 80x5 rep record and the e1RM (96 > 93.3).
  assert.deepEqual(detectPrs({ weight: 80, reps: 6 }, r), ['e1rm', 'reps'])
  // 70x8 ties — nothing.
  assert.deepEqual(detectPrs({ weight: 70, reps: 8 }, r), [])
  // 75x6 is a rep PR: the most reps ever done at >=75 kg is 5 (80x5).
  assert.deepEqual(detectPrs({ weight: 75, reps: 6 }, r), ['reps'])
  // 75x5 isn't a rep PR because 80x5 exists.
  assert.deepEqual(detectPrs({ weight: 75, reps: 5 }, r), [])
  // No history for the lift → no PR noise on the first ever session.
  assert.deepEqual(detectPrs({ weight: 50, reps: 5 }, undefined), [])
}

function testSeriesAndTracked() {
  const sets = liftSetsFromSessions([
    session('2026-01-05', [ex('Bench Press', [[80, 5], [85, 1]])]),
    session('2026-01-12', [ex('Bench Press', [[82.5, 5]])]),
    session('2026-01-13', [ex('Curl', [[15, 10]])]),
  ])
  assert.deepEqual(e1rmSeries(sets, 'bench_press_kg').map((p) => [p.date, p.e1rm]), [['2026-01-05', 93.3], ['2026-01-12', 96.3]])
  assert.deepEqual(trackedLifts(sets).map((l) => l.key), ['bench_press_kg'])
}

function testApplySetToRecords() {
  const base = computeRecords(liftSetsFromSessions([session('2026-01-05', [ex('Bench Press', [[80, 5]])])])).get('bench_press_kg')
  const after = applySetToRecords(base, { weight: 82.5, reps: 3 })
  assert.equal(after.bestWeight, 82.5)
  assert.deepEqual(detectPrs({ weight: 82.5, reps: 3 }, after), [])
  assert.deepEqual(detectPrs({ weight: 82.5, reps: 4 }, after), ['e1rm', 'reps'])
  assert.equal(base?.bestWeight, 80, 'input records are not mutated')
  assert.equal(applySetToRecords(undefined, { weight: 50, reps: 5 }).bestWeight, 50)
}

testE1rm()
testApplySetToRecords()
testSetsUseLogAndFallBackToActuals()
testRecordsSkipExcludedAndVariants()
testDetectPrs()
testSeriesAndTracked()
console.log('strength tests passed')
