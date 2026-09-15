import assert from 'node:assert/strict'

// These are pure-shape tests against the exported types/functions existing and
// being callable — full live-API testing isn't feasible here (see plan notes on
// no test runner / unofficial API), so this test asserts the module's public
// surface and a date-format guard, not live Garmin data.
import {
  parseSleepDto,
  fetchBodyBattery,
  fetchStress,
  fetchVO2Max,
  fetchFitnessAge,
} from './garmin'

// ============================================================================
// parseSleepDto pure function tests
// ============================================================================

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

// ============================================================================
// Fetcher regression tests (exported functions exist and handle missing creds)
// ============================================================================

async function testFetcherExportsAndErrorHandling() {
  {
    assert.equal(typeof fetchBodyBattery, 'function', 'fetchBodyBattery is exported as a function')
  }
  {
    assert.equal(typeof fetchStress, 'function', 'fetchStress is exported as a function')
  }
  {
    // Without GARMIN_EMAIL/GARMIN_PASSWORD set, createClient() throws synchronously
    // inside the async function — fetchBodyBattery must NOT let that throw escape,
    // it must catch and resolve null per the Global Constraints contract.
    // This script is a standalone process that exits right after running, so
    // there's no need to save/restore the real env vars — just clear them.
    delete process.env.GARMIN_EMAIL
    delete process.env.GARMIN_PASSWORD
    const result = await fetchBodyBattery('2026-07-30')
    assert.equal(result, null, 'fetchBodyBattery resolves null (not throws) when credentials are missing')
  }
  {
    const result = await fetchStress('2026-07-30')
    assert.equal(result, null, 'fetchStress resolves null (not throws) when credentials are missing')
  }
  {
    assert.equal(typeof fetchVO2Max, 'function', 'fetchVO2Max is exported as a function')
  }
  {
    assert.equal(typeof fetchFitnessAge, 'function', 'fetchFitnessAge is exported as a function')
  }
  {
    const result = await fetchVO2Max('2026-07-30')
    assert.equal(result, null, 'fetchVO2Max resolves null (not throws) when credentials are missing')
  }
  {
    const result = await fetchFitnessAge('2026-07-30')
    assert.equal(result, null, 'fetchFitnessAge resolves null (not throws) when credentials are missing')
  }
}

// ============================================================================
// Run all tests
// ============================================================================

async function run() {
  testParsesFullDto()
  testMissingExtendedFieldsAreNull()
  testNoSleepTimeReturnsNull()
  await testFetcherExportsAndErrorHandling()
  console.log('lib/garmin.test.ts: all assertions passed')
}

run()
