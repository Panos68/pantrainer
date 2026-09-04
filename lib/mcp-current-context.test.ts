import assert from 'node:assert/strict'
import { buildCurrentContext } from './mcp-current-context'

const session = {
  date: '2026-09-04', day: 'Friday', type: 'Strength', exercises: [{ name: 'Squat', sets: 3, reps: 5, set_log: Array.from({ length: 100 }, () => ({ reps: 5, weight_kg: 100, effort: null, completed_at: 'now' })) }],
  status: 'completed', photos: [], muscle_groups: [],
} as const
const week = {
  week: 'Sep 1-7, 2026', athlete: { name: 'Panos', age: 40, weight_kg: 80, smm_kg: 35, bf_pct: 15, bmr_kcal: 1800, rhr_bpm: 50, smm_target_kg: 37 }, sessions: [session],
  week_summary: { total_sessions: 1, high_output_days: 0, strength_days: 1, recovery_days: 0, total_calories: 0 }, lift_progression: {}, health_flags: [], next_week_plan: {}, garmin_recovery: {}, daily_readiness: {}, daily_scores: {},
} as never

const context = buildCurrentContext(week, {} as never, null, null, '2026-09-04')
assert.equal(context.today_session?.exercises[0].set_log.length, 100)
assert.equal('set_log' in context.week_schedule[0].exercises[0], false)
assert.ok(JSON.stringify(context.week_schedule).length < JSON.stringify(week.sessions).length / 2)
console.log('lib/mcp-current-context.test.ts: all assertions passed')
