import assert from 'node:assert/strict'
import { generateDemoData } from './demo-data'
import { WeekDocSchema, AthleteProfileSchema } from './schema'
import { buildStrengthSummary } from './strength-summary'

const TODAY = '2026-10-07' // a Wednesday

function testValidAgainstSchemas() {
  const data = generateDemoData(TODAY)
  AthleteProfileSchema.parse(data.profile)
  for (const { week } of data.archived) WeekDocSchema.parse(week)
  WeekDocSchema.parse(data.current)
  assert.equal(data.archived.length, 12)
}

function testCurrentWeekSplitsAroundToday() {
  const { current } = generateDemoData(TODAY)
  assert.equal(current.sessions[0].date, '2026-10-05')
  assert.equal(current.sessions[0].status, 'completed') // Monday
  assert.equal(current.sessions[2].date, TODAY)
  assert.equal(current.sessions[2].status, 'planned') // today is still to do
  assert.equal(current.garmin_recovery[TODAY], undefined)
}

function testDeterministic() {
  assert.deepEqual(generateDemoData(TODAY), generateDemoData(TODAY))
}

function testFeedsTheAnalytics() {
  const data = generateDemoData(TODAY)
  const sessions = [...data.archived.flatMap((a) => a.week.sessions), ...data.current.sessions]
  const summary = buildStrengthSummary(sessions)
  assert.ok(summary.lifts.length >= 8)
  assert.ok(summary.balance.length >= 3)
  assert.ok(Object.values(summary.suggestions).some((s) => s.action === 'increase'))
}

testValidAgainstSchemas()
testCurrentWeekSplitsAroundToday()
testDeterministic()
testFeedsTheAnalytics()
console.log('demo-data tests passed')
