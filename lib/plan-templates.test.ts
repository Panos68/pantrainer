import assert from 'node:assert/strict'
import { buildTemplateWeek, getTemplate, PLAN_TEMPLATES, templateWeekMonday, weightPlanner } from './plan-templates'
import { WeekDocSchema, type Exercise, type Session } from './schema'

const ATHLETE = { name: 'A', age: 30, weight_kg: 80, smm_kg: 0, bf_pct: 0, bmr_kcal: 0, rhr_bpm: 0, smm_target_kg: 0 }

function done(date: string, name: string, reps: Exercise['reps'], weight: number, logged: number[]): Session {
  return {
    date, day: 'Monday', type: 'Strength', status: 'completed', photos: [], muscle_groups: [],
    exercises: [{ name, reps, alternatives: [], set_log: logged.map((r) => ({ reps: r, weight_kg: weight, effort: null, completed_at: 'x' })) }],
  } as unknown as Session
}

function testEveryTemplateBuildsAValidWeek() {
  for (const t of PLAN_TEMPLATES) {
    const week = WeekDocSchema.parse(buildTemplateWeek(t, '2026-10-12', ATHLETE, []))
    assert.equal(week.sessions.length, 7, t.id)
    assert.equal(week.sessions[0].date, '2026-10-12')
    assert.equal(week.sessions[6].day, 'Sunday')
    const training = week.sessions.filter((s) => s.type !== 'Rest').length
    assert.equal(training, t.daysPerWeek, `${t.id} day count`)
    assert.ok(week.sessions.every((s) => s.status === 'planned'))
  }
}

function testWeightsComeFromHistory() {
  const history = [
    done('2026-09-28', 'Bench Press', 5, 80, [5, 5, 5]), // hit 5 → engine says 82.5
    done('2026-09-29', 'Pendlay Row', 'AMRAP', 60, [10]), // unparseable reps → last weight
  ]
  const plan = weightPlanner(history)
  assert.equal(plan('Barbell Bench Press').weight, 82.5)
  assert.match(plan('Barbell Bench Press').note ?? '', /add 2\.5 kg/)
  assert.equal(plan('Pendlay Row').weight, 60)
  assert.equal(plan('Barbell Back Squat').weight, null)

  const week = buildTemplateWeek(getTemplate('strength-5x5')!, '2026-10-12', ATHLETE, history)
  const bench = week.sessions[0].exercises.find((e) => e.name === 'Barbell Bench Press')
  assert.equal(bench?.weight_kg, 82.5)
}

function testMondays() {
  assert.equal(templateWeekMonday('2026-10-07', 'current'), '2026-10-05')
  assert.equal(templateWeekMonday('2026-10-07', 'next'), '2026-10-12')
  assert.equal(templateWeekMonday('2026-10-11', 'next'), '2026-10-12') // Sunday
}

testEveryTemplateBuildsAValidWeek()
testWeightsComeFromHistory()
testMondays()
console.log('plan-templates tests passed')
