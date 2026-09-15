import assert from 'node:assert/strict'
import { calcRecoveryScore, CONFIDENCE_FLOOR } from './recovery-score'
import type { GarminRecoveryDay } from './schema'
import type { Baselines } from './baselines'

const noBaselines: Baselines = { rhr: null, hrv: null, sleep_hours: null }
const fullBaselines: Baselines = {
  rhr: { median: 50, spread: 3, n: 28 },
  hrv: { median: 60, spread: 8, n: 28 },
  sleep_hours: { median: 7.5, spread: 0.5, n: 28 },
}

function testFullDataProducesHighConfidence() {
  const garmin: GarminRecoveryDay = {
    sleep_hours: 7.5, deep_sleep_hours: 1.5, resting_hr_bpm: 48, hrv_overnight_ms: 60,
  }
  const result = calcRecoveryScore(garmin, 50, 0.9, { date: '2026-09-15', energy_level: 4, sleep_quality: 4, mood: 4, logged_at: '' }, fullBaselines)
  assert.equal(result.confidence, 1)
  assert.ok(result.label !== null)
  assert.ok(result.version === 2)
}

function testMissingHrvDegradesConfidenceNotCrash() {
  const garmin: GarminRecoveryDay = { sleep_hours: 7.5, deep_sleep_hours: 1.5, resting_hr_bpm: 48 }
  const result = calcRecoveryScore(garmin, 50, 0.9, null, fullBaselines)
  assert.ok(result.confidence < 1)
  assert.equal(result.hrv, null)
}

function testLowConfidenceSuppressesLabel() {
  // Only sleep hours present, no HRV baseline, no RHR baseline, no ACWR, no readiness
  const garmin: GarminRecoveryDay = { sleep_hours: 7.5 }
  const result = calcRecoveryScore(garmin, 50, null, null, noBaselines)
  assert.ok(result.confidence < CONFIDENCE_FLOOR)
  assert.equal(result.label, null)
  assert.equal(result.color, null)
  assert.ok(typeof result.total === 'number') // numeric score still present
}

function testSleepScoreNotCappedWithoutDeepSleepData() {
  // 8h sleep, no deep-sleep field at all — should score near the top of the
  // sleep component's own scale, not be stuck at the old 30/40 cap.
  const garmin: GarminRecoveryDay = { sleep_hours: 8 }
  const result = calcRecoveryScore(garmin, 50, null, null, fullBaselines)
  assert.ok(result.sleep > 30, `expected sleep score above the old 30-cap, got ${result.sleep}`)
}

function testWeightRedistributionWhenLoadOptsOut() {
  // acwr null -> load opts out; confidence should reflect 80/100 available
  // (hrv+sleep+rhr+subjective = 25+25+20+10 = 80), not crash or zero the total.
  const garmin: GarminRecoveryDay = { sleep_hours: 7.5, deep_sleep_hours: 1.5, resting_hr_bpm: 48, hrv_overnight_ms: 60 }
  const result = calcRecoveryScore(garmin, 50, null, { date: '2026-09-15', energy_level: 4, sleep_quality: 4, mood: 4, logged_at: '' }, fullBaselines)
  assert.equal(result.load, 15)
  assert.equal(Math.round(result.confidence * 100), 80)
}

testFullDataProducesHighConfidence()
testMissingHrvDegradesConfidenceNotCrash()
testLowConfidenceSuppressesLabel()
testSleepScoreNotCappedWithoutDeepSleepData()
testWeightRedistributionWhenLoadOptsOut()
console.log('lib/recovery-score.test.ts: all assertions passed')
