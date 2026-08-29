import assert from 'node:assert/strict'
import { isMidDaySnapshot, sanitizeRecovery, hasAnyRecoveryMetric } from './recovery-freshness'

// Regression case: 2026-08-28 was cached at 05:52 that same morning with
// total_kilocalories=610 — a pre-breakfast burn frozen as the day's final
// total, which rendered as a phantom ~1900 kcal surplus against 2542 intake.
function testSameDaySnapshotIsStale() {
  assert.equal(isMidDaySnapshot('2026-08-28', '2026-08-28T05:52:46.368Z'), true)
}

function testNextDayFetchIsFinal() {
  assert.equal(isMidDaySnapshot('2026-08-28', '2026-08-29T11:48:04.383Z'), false)
}

function testLateEveningLocalIsStillSameDay() {
  // 21:30 UTC on the 28th is 23:30 in Europe/Stockholm (CEST) — still the 28th
  // locally, so the day hasn't closed and the totals are not final.
  assert.equal(isMidDaySnapshot('2026-08-28', '2026-08-28T21:30:00.000Z'), true)
}

function testJustAfterLocalMidnightIsFinal() {
  // 22:30 UTC on the 28th is 00:30 on the 29th in Stockholm — the day is over.
  assert.equal(isMidDaySnapshot('2026-08-28', '2026-08-28T22:30:00.000Z'), false)
}

function testMissingOrUnparseableTimestampIsStale() {
  assert.equal(isMidDaySnapshot('2026-08-28', null), true)
  assert.equal(isMidDaySnapshot('2026-08-28', undefined), true)
  assert.equal(isMidDaySnapshot('2026-08-28', 'not-a-date'), true)
}

function testSanitizeDropsNonPositiveCalories() {
  assert.equal(sanitizeRecovery({ total_kilocalories: 0 }).total_kilocalories, null)
  assert.equal(sanitizeRecovery({ total_kilocalories: 2237 }).total_kilocalories, 2237)
}

function testHasAnyRecoveryMetricIgnoresFetchedAt() {
  // fetched_at is always populated by sanitizeRecovery, so it must not on its
  // own make an otherwise-empty payload look worth caching.
  assert.equal(hasAnyRecoveryMetric(sanitizeRecovery({})), false)
  assert.equal(hasAnyRecoveryMetric(sanitizeRecovery({ total_kilocalories: 2237 })), true)
}

testSameDaySnapshotIsStale()
testNextDayFetchIsFinal()
testLateEveningLocalIsStillSameDay()
testJustAfterLocalMidnightIsFinal()
testMissingOrUnparseableTimestampIsStale()
testSanitizeDropsNonPositiveCalories()
testHasAnyRecoveryMetricIgnoresFetchedAt()
console.log('lib/garmin-recovery.test.ts: all assertions passed')
