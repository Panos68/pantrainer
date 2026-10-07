import assert from 'node:assert/strict'
import { structuralBalance } from './structural-balance'
import type { LiftRecords } from './strength'

function rec(bestE1rm: number): LiftRecords {
  return { bestWeight: bestE1rm, bestE1rm, repsAtWeight: {} }
}

function testComputesOnlyAvailableRatios() {
  const results = structuralBalance(new Map([
    ['bench_press_kg', rec(100)],
    ['deadlift_kg', rec(160)],
  ]))
  assert.deepEqual(results.map((r) => r.id), ['bench-deadlift'])
  assert.equal(results[0].ratio, 0.63)
  assert.equal(results[0].status, 'ok')
  assert.equal(results[0].hint, null)
}

function testFlagsLowAndHigh() {
  const results = structuralBalance(new Map([
    ['bench_press_kg', rec(100)],
    ['push_press_kg', rec(50)],
    ['pendlay_row_kg', rec(70)],
    ['deadlift_kg', rec(120)],
  ]))
  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  assert.equal(byId['overhead-bench'].status, 'low')
  assert.equal(byId['row-bench'].status, 'low')
  assert.equal(byId['bench-deadlift'].status, 'high')
  assert.match(byId['row-bench'].hint ?? '', /Add rows/)
}

function testPicksBestOfAliasKeys() {
  const results = structuralBalance(new Map([
    ['back_squat_kg', rec(120)],
    ['squat_kg', rec(130)],
    ['deadlift_kg', rec(150)],
  ]))
  assert.equal(results[0].numeratorKg, 130)
}

testComputesOnlyAvailableRatios()
testFlagsLowAndHigh()
testPicksBestOfAliasKeys()
console.log('structural-balance tests passed')
