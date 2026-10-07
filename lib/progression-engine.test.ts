import assert from 'node:assert/strict'
import {
  parseRepRange,
  suggestNext,
  suggestionsFromSessions,
  weightIncrement,
  type ExercisePerformance,
} from './progression-engine'
import type { Exercise, Session } from './schema'

function perf(date: string, weight: number, reps: number[], range: [number, number] = [5, 5], hard = false): ExercisePerformance {
  return { date, weight, reps, repRange: range, hard }
}

function testParseRepRange() {
  assert.deepEqual(parseRepRange(5), [5, 5])
  assert.deepEqual(parseRepRange('8-10'), [8, 10])
  assert.deepEqual(parseRepRange('8–12'), [8, 12])
  assert.deepEqual(parseRepRange(' 6 '), [6, 6])
  assert.equal(parseRepRange('AMRAP'), null)
  assert.equal(parseRepRange('30s'), null)
  assert.equal(parseRepRange(null), null)
}

function testIncrements() {
  assert.equal(weightIncrement('deadlift_kg'), 5)
  assert.equal(weightIncrement('bench_press_kg'), 2.5)
  assert.equal(weightIncrement('db_push_press_kg'), 2)
}

function testIncreaseWhenAllSetsHitTop() {
  const s = suggestNext('bench_press_kg', 'Bench Press', [perf('2026-01-05', 60, [5, 5, 5])])!
  assert.equal(s.action, 'increase')
  assert.equal(s.targetWeight, 62.5)
  assert.equal(s.targetReps, 5)
  assert.match(s.reason, /add 2\.5 kg/)
}

function testMissedRepsNeverAddLoad() {
  const s = suggestNext('bench_press_kg', 'Bench Press', [perf('2026-01-05', 60, [5, 5, 4])])!
  assert.equal(s.action, 'repeat')
  assert.equal(s.targetWeight, 60)
  assert.match(s.reason, /Missed reps never add load/)
}

function testHardTopSetRepeats() {
  const s = suggestNext('bench_press_kg', 'Bench Press', [perf('2026-01-05', 60, [5, 5, 5], [5, 5], true)])!
  assert.equal(s.action, 'repeat')
  assert.equal(s.targetWeight, 60)
}

function testBuildRepsInRange() {
  const s = suggestNext('row_kg', 'Row', [perf('2026-01-05', 50, [9, 8, 8], [8, 10])])!
  assert.equal(s.action, 'build_reps')
  assert.equal(s.targetWeight, 50)
  assert.equal(s.targetReps, 9)
}

function testDeloadAfterStall() {
  const s = suggestNext('bench_press_kg', 'Bench Press', [
    perf('2026-01-01', 60, [5, 5, 4]),
    perf('2026-01-03', 60, [5, 4, 4]),
    perf('2026-01-05', 60, [5, 5, 3]),
  ])!
  assert.equal(s.action, 'deload')
  assert.equal(s.targetWeight, 55)
}

function testLoadChangeRestartsStallCount() {
  // Two misses at 57.5 then two at 60 — only 2 consecutive at the current load.
  const s = suggestNext('bench_press_kg', 'Bench Press', [
    perf('2026-01-01', 57.5, [5, 5, 4]),
    perf('2026-01-02', 57.5, [5, 4, 4]),
    perf('2026-01-03', 60, [5, 5, 4]),
    perf('2026-01-05', 60, [5, 4, 4]),
  ])!
  assert.equal(s.action, 'repeat')
}

function testFromSessionsSkipsExcludedAndUnparseable() {
  const ex = (name: string, reps: Exercise['reps'], weight: number, done: number[], extra: Partial<Exercise> = {}) => ({
    name, reps, alternatives: [],
    set_log: done.map((r) => ({ reps: r, weight_kg: weight, effort: null, completed_at: 'x' })),
    ...extra,
  }) as Exercise
  const session = (date: string, exercises: Exercise[], extra: Partial<Session> = {}) =>
    ({ date, day: 'Monday', type: 'Strength', status: 'completed', exercises, photos: [], muscle_groups: [], ...extra }) as Session
  const map = suggestionsFromSessions([
    session('2026-01-05', [ex('Bench Press', 5, 60, [5, 5, 5]), ex('Plank', '45s', 0, [1])]),
    session('2026-01-07', [ex('Bench Press', 5, 40, [5, 5, 5])], { exclude_from_progress: true }),
  ])
  assert.deepEqual([...map.keys()], ['bench_press_kg'])
  assert.equal(map.get('bench_press_kg')?.targetWeight, 62.5)
}

testParseRepRange()
testIncrements()
testIncreaseWhenAllSetsHitTop()
testMissedRepsNeverAddLoad()
testHardTopSetRepeats()
testBuildRepsInRange()
testDeloadAfterStall()
testLoadChangeRestartsStallCount()
testFromSessionsSkipsExcludedAndUnparseable()
console.log('progression-engine tests passed')
