import assert from 'node:assert/strict'
import { calcACWR } from './daily-score'
import type { TrainingLoadPoint } from './training-load'

function point(date: string, load: number): TrainingLoadPoint {
  return { date, training_load: load, source: 'srpe' as const } as unknown as TrainingLoadPoint
}

function testAnchorsOnAsOfDateNotLastSessionDate() {
  // 30 days of steady load, then a 10-day layoff. asOfDate is 10 days after
  // the last session. Acute window (asOfDate-6..asOfDate) should be empty
  // (load has decayed to ~0), not anchored on the last session's own date.
  const points = Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-08-01T12:00:00')
    d.setDate(d.getDate() + i)
    return point(d.toISOString().split('T')[0], 100)
  })
  const lastSessionDate = points[points.length - 1].date // 2026-08-30
  const asOfDate = '2026-09-09' // 10 days after last session
  const acwrAnchoredOnAsOf = calcACWR(points, asOfDate)
  const acwrAnchoredOnLastSession = calcACWR(points, lastSessionDate)
  assert.ok(
    acwrAnchoredOnAsOf === null || acwrAnchoredOnAsOf < acwrAnchoredOnLastSession!,
    `expected layoff to lower or null out ACWR (got ${acwrAnchoredOnAsOf} vs ${acwrAnchoredOnLastSession})`
  )
}

function testStillRequires21DaySpan() {
  const points = [point('2026-09-01', 100), point('2026-09-02', 100)]
  assert.equal(calcACWR(points, '2026-09-15'), null)
}

testAnchorsOnAsOfDateNotLastSessionDate()
testStillRequires21DaySpan()
console.log('lib/daily-score.test.ts: all assertions passed')
