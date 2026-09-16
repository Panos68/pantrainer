import assert from 'node:assert/strict'
import { calcBaselines } from './baselines'
import type { WeekDoc } from './schema'

function weekWithRecovery(entries: Record<string, { resting_hr_bpm?: number; hrv_overnight_ms?: number; sleep_hours?: number }>): WeekDoc {
  return {
    week: 'test',
    athlete: { name: 'T', age: 30, weight_kg: 80, smm_kg: 40, bf_pct: 15, bmr_kcal: 1800, rhr_bpm: 50, smm_target_kg: 40 },
    sessions: [],
    week_summary: { total_sessions: 0, high_output_days: 0, strength_days: 0, recovery_days: 0, total_calories: 0 },
    lift_progression: {},
    health_flags: [],
    next_week_plan: {},
    garmin_recovery: entries,
    renpho_measurements: {},
    daily_readiness: {},
    daily_scores: {},
  } as WeekDoc
}

function datesEndingAt(endDate: string, count: number): string[] {
  const end = new Date(endDate + 'T12:00:00')
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    return d.toISOString().split('T')[0]
  })
}

function testReturnsNullBelow14Samples() {
  const dates = datesEndingAt('2026-09-14', 10)
  const entries = Object.fromEntries(dates.map((d) => [d, { resting_hr_bpm: 50 }]))
  const week = weekWithRecovery(entries)
  const result = calcBaselines('2026-09-15', [week])
  assert.equal(result.rhr, null)
}

function testComputesMedianAndMadWith14Plus() {
  const dates = datesEndingAt('2026-09-14', 20)
  // 19 days at RHR 50, one outlier day at 70 — median should ignore the outlier
  const entries = Object.fromEntries(dates.map((d, i) => [d, { resting_hr_bpm: i === 0 ? 70 : 50 }]))
  const week = weekWithRecovery(entries)
  const result = calcBaselines('2026-09-15', [week])
  assert.ok(result.rhr !== null)
  assert.equal(result.rhr!.median, 50)
  assert.equal(result.rhr!.n, 20)
}

function testExcludesDateItself() {
  const dates = datesEndingAt('2026-09-15', 20) // includes the query date
  const entries = Object.fromEntries(dates.map((d) => [d, { resting_hr_bpm: 50 }]))
  const week = weekWithRecovery(entries)
  const result = calcBaselines('2026-09-15', [week])
  assert.equal(result.rhr!.n, 19) // 20 dates minus the query date itself
}

function testHrvAndSleepIndependentOfRhr() {
  const dates = datesEndingAt('2026-09-14', 20)
  const entries = Object.fromEntries(dates.map((d) => [d, { hrv_overnight_ms: 55, sleep_hours: 7.5 }]))
  const week = weekWithRecovery(entries)
  const result = calcBaselines('2026-09-15', [week])
  assert.equal(result.rhr, null) // no rhr data at all
  assert.ok(result.hrv !== null)
  assert.equal(result.hrv!.median, 55)
  assert.ok(result.sleep_hours !== null)
  assert.equal(result.sleep_hours!.median, 7.5)
}

testReturnsNullBelow14Samples()
testComputesMedianAndMadWith14Plus()
testExcludesDateItself()
testHrvAndSleepIndependentOfRhr()
console.log('lib/baselines.test.ts: all assertions passed')
