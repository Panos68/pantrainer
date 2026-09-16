import assert from 'node:assert/strict'
import { sanitizeRecovery, hasAnyRecoveryMetric } from './recovery-freshness'

function testSanitizesHrvFields() {
  const result = sanitizeRecovery({
    hrv_overnight_ms: 58,
    hrv_status: 'BALANCED',
    sleep_score: 84,
    avg_sleep_stress: 18,
    awake_count: 0,
    respiration_avg: 14.2,
    hrv_baseline_low: 45,
    hrv_baseline_high: 65,
    spo2_avg: 96,
  })
  assert.equal(result.hrv_overnight_ms, 58)
  assert.equal(result.hrv_status, 'BALANCED')
  assert.equal(result.sleep_score, 84)
  assert.equal(result.awake_count, 0) // zero is a valid, meaningful value — must not become null
  assert.equal(result.hrv_baseline_low, 45)
  assert.equal(result.spo2_avg, 96)
}

function testInvalidHrvStatusBecomesNull() {
  const result = sanitizeRecovery({ hrv_status: 123 as unknown as string })
  assert.equal(result.hrv_status, null)
}

function testNegativeAwakeCountBecomesNull() {
  const result = sanitizeRecovery({ awake_count: -1 })
  assert.equal(result.awake_count, null)
}

function testHasAnyRecoveryMetricTrueForHrvOnly() {
  const result = sanitizeRecovery({ hrv_overnight_ms: 58 })
  assert.equal(hasAnyRecoveryMetric(result), true)
}

testSanitizesHrvFields()
testInvalidHrvStatusBecomesNull()
testNegativeAwakeCountBecomesNull()
testHasAnyRecoveryMetricTrueForHrvOnly()
console.log('lib/recovery-freshness.test.ts: all assertions passed')
