import assert from 'node:assert/strict'
import { calcLoad } from './training-load'
import type { Session } from './schema'

const athlete = { rhr: 50, maxHr: 180 }

function session(overrides: Partial<Session>): Session {
  return {
    date: '2026-08-01',
    type: 'class',
    status: 'completed',
    duration_min: null,
    avg_hr_bpm: null,
    rpe: null,
    training_stress_score: null,
    ...overrides,
  } as Session
}

function testGarminTssWinsWhenPresent() {
  const s = session({ training_stress_score: 42, rpe: 8, avg_hr_bpm: 150 })
  assert.deepEqual(calcLoad(s, athlete), { load: 42, source: 'garmin_tss' })
}

function testBlendsRpeAndHrWhenBothPresent() {
  // duration 55, rpe 6 -> sRPE load 83; avg_hr 114 -> TRIMP load computed via calcTrimp
  const s = session({ duration_min: 55, rpe: 6, avg_hr_bpm: 114 })
  const result = calcLoad(s, athlete)
  assert.equal(result?.source, 'blended')
  // sanity: blended load should sit between (or at) the two component loads
  const sRpeOnly = calcLoad(session({ duration_min: 55, rpe: 6 }), athlete)!.load
  const hrOnly = calcLoad(session({ duration_min: 55, avg_hr_bpm: 114 }), athlete)!.load
  assert.ok(result!.load <= Math.max(sRpeOnly, hrOnly) && result!.load >= Math.min(sRpeOnly, hrOnly))
}

function testFallsBackToSrpeWhenHrMissing() {
  const s = session({ duration_min: 55, rpe: 6 })
  assert.deepEqual(calcLoad(s, athlete), { load: 83, source: 'srpe' })
}

function testFallsBackToTrimpWhenRpeMissing() {
  const s = session({ duration_min: 55, avg_hr_bpm: 114 })
  const result = calcLoad(s, athlete)
  assert.equal(result?.source, 'trimp')
}

function testHrDurationFallbackWithoutAthleteParams() {
  const s = session({ duration_min: 55, avg_hr_bpm: 114 })
  const result = calcLoad(s)
  assert.equal(result?.source, 'hr_duration')
}

function testNullWhenNeitherPresent() {
  const s = session({ duration_min: 55 })
  assert.equal(calcLoad(s, athlete), null)
}

function testHigherHrOutranksLongerDurationAtSameRpe() {
  // Regression case: Sat (53min, HR 129, RPE 6) vs Mon (55min, HR 114, RPE 6) —
  // sRPE-only ranked Monday higher despite Saturday's clearly harder HR.
  const sat = calcLoad(session({ duration_min: 53, rpe: 6, avg_hr_bpm: 129 }), athlete)!
  const mon = calcLoad(session({ duration_min: 55, rpe: 6, avg_hr_bpm: 114 }), athlete)!
  assert.ok(sat.load > mon.load, `expected Saturday's blended load (${sat.load}) to exceed Monday's (${mon.load})`)
}

testGarminTssWinsWhenPresent()
testBlendsRpeAndHrWhenBothPresent()
testFallsBackToSrpeWhenHrMissing()
testFallsBackToTrimpWhenRpeMissing()
testHrDurationFallbackWithoutAthleteParams()
testNullWhenNeitherPresent()
testHigherHrOutranksLongerDurationAtSameRpe()
console.log('lib/training-load.test.ts: all assertions passed')
