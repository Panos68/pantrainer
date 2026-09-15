import assert from 'node:assert/strict'
import { parseSleepDto } from './garmin'

function testParsesFullDto() {
  const dto = {
    sleepTimeSeconds: 27000, // 7.5h
    deepSleepSeconds: 5400,  // 1.5h
    remSleepSeconds: 3600,   // 1h
    avgOvernightHrv: 62,
    hrvStatus: 'BALANCED',
    sleepScores: { overall: { value: 84 } },
    avgSleepStress: 18,
    awakeCount: 2,
    averageRespirationValue: 14.2,
  }
  assert.deepEqual(parseSleepDto(dto), {
    sleep_hours: 7.5,
    deep_sleep_hours: 1.5,
    rem_sleep_hours: 1,
    hrv_overnight_ms: 62,
    hrv_status: 'BALANCED',
    sleep_score: 84,
    avg_sleep_stress: 18,
    awake_count: 2,
    respiration_avg: 14.2,
  })
}

function testMissingExtendedFieldsAreNull() {
  const dto = { sleepTimeSeconds: 27000, deepSleepSeconds: 5400, remSleepSeconds: 3600 }
  const result = parseSleepDto(dto)
  assert.equal(result.hrv_overnight_ms, null)
  assert.equal(result.hrv_status, null)
  assert.equal(result.sleep_score, null)
  assert.equal(result.avg_sleep_stress, null)
  assert.equal(result.awake_count, null)
  assert.equal(result.respiration_avg, null)
}

function testNoSleepTimeReturnsNull() {
  assert.equal(parseSleepDto({ sleepTimeSeconds: 0 }), null)
}

testParsesFullDto()
testMissingExtendedFieldsAreNull()
testNoSleepTimeReturnsNull()
console.log('lib/garmin.test.ts: all assertions passed')
