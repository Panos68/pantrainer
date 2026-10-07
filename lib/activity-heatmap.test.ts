import assert from 'node:assert/strict'
import { buildHeatmap, dayLevel, streakStats } from './activity-heatmap'
import type { Session } from './schema'

function s(date: string, type = 'Strength', duration_min: number | null = 60, status: Session['status'] = 'completed'): Session {
  return { date, day: 'x', type, status, duration_min, exercises: [], photos: [], muscle_groups: [] } as Session
}

function testGridShape() {
  // 2026-10-07 is a Wednesday.
  const grid = buildHeatmap([], '2026-10-07', 4)
  assert.equal(grid.length, 4)
  assert.ok(grid.every((col) => col.length === 7))
  assert.equal(grid[3][0].date, '2026-10-05') // Monday of the current week
  assert.equal(grid[0][0].date, '2026-09-14')
  assert.equal(grid[3][2].inFuture, false)
  assert.equal(grid[3][3].inFuture, true)
}

function testAggregatesDays() {
  const grid = buildHeatmap([
    s('2026-10-06', 'Strength', 50),
    s('2026-10-06', 'Conditioning', 40),
    s('2026-10-05', 'Rest', null),
    s('2026-10-07', 'Strength', 60, 'planned'),
  ], '2026-10-07', 1)
  const tue = grid[0][1]
  assert.equal(tue.sessions, 2)
  assert.deepEqual(tue.types.sort(), ['Conditioning', 'Strength'])
  assert.equal(tue.minutes, 90)
  assert.equal(tue.level, 3)
  assert.equal(grid[0][0].sessions, 0) // rest days don't count
  assert.equal(grid[0][2].sessions, 0) // planned doesn't count
}

function testLevels() {
  assert.equal(dayLevel(0, 0), 0)
  assert.equal(dayLevel(1, 20), 1)
  assert.equal(dayLevel(1, 0), 2)
  assert.equal(dayLevel(1, 120), 4)
}

function testStreaks() {
  const grid = buildHeatmap([
    s('2026-09-15'), s('2026-09-22'), // weeks 1-2 active
    s('2026-10-01'), // week 3 active
  ], '2026-10-07', 4) // week 4 (current) empty so far
  assert.deepEqual(streakStats(grid), { activeDays: 3, longestWeekStreak: 3, currentWeekStreak: 3 })
}

testGridShape()
testAggregatesDays()
testLevels()
testStreaks()
console.log('activity-heatmap tests passed')
