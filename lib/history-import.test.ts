import assert from 'node:assert/strict'
import {
  detectFormat,
  mondayOf,
  normalizeDateTime,
  parseCsv,
  parseHistoryCsv,
  planImport,
  setsToSessions,
  weekLabel,
} from './history-import'

const STRONG = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2024-03-12 07:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),W,40,10,0,0,,,',
  '2024-03-12 07:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),1,80,5,0,0,"felt ""solid""",,8',
  '2024-03-12 07:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),2,80,5,0,0,,,8',
  '2024-03-12 07:30:00,"Push, heavy",1h 5m,Plank,1,0,0,0,60,,,',
  '2024-03-14 18:00:00,Pull,45m,Deadlift (Barbell),1,140,3,0,0,,,9',
].join('\n')

const HEVY = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Legs","18 Mar 2024, 18:06","18 Mar 2024, 19:16","","Squat (Barbell)","","","0","warmup","60","5","","",""',
  '"Legs","18 Mar 2024, 18:06","18 Mar 2024, 19:16","","Squat (Barbell)","","","1","normal","100","5","","","8"',
  '"Legs","18 Mar 2024, 18:06","18 Mar 2024, 19:16","","Squat (Barbell)","","","2","normal","100","4","","",""',
].join('\r\n')

function testCsvParsing() {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\n1,2,3'), [['a', 'b,c', 'd "e"'], ['1', '2', '3']])
  assert.deepEqual(parseCsv('a;b\n1;2\n\n'), [['a', 'b'], ['1', '2']])
}

function testDetectAndDates() {
  assert.equal(detectFormat(parseCsv(STRONG)[0]), 'strong')
  assert.equal(detectFormat(parseCsv(HEVY)[0]), 'hevy')
  assert.equal(detectFormat(['foo', 'bar']), null)
  assert.equal(normalizeDateTime('2024-03-12 07:30:00'), '2024-03-12 07:30')
  assert.equal(normalizeDateTime('18 Mar 2024, 18:06'), '2024-03-18 18:06')
  assert.equal(normalizeDateTime('garbage'), null)
}

function testStrong() {
  const { format, sets, skippedRows } = parseHistoryCsv(STRONG)
  assert.equal(format, 'strong')
  assert.equal(skippedRows, 2) // warm-up + timed plank
  const sessions = setsToSessions(sets, format)
  assert.equal(sessions.length, 2)
  const push = sessions[0]
  assert.equal(push.subtype, 'Push, heavy')
  assert.equal(push.day, 'Tuesday')
  assert.equal(push.duration_min, 65)
  assert.equal(push.rpe, 8)
  assert.equal(push.exercises[0].name, 'Bench Press (Barbell)')
  assert.deepEqual(push.exercises[0].set_log?.map((s) => [s.weight_kg, s.reps]), [[80, 5], [80, 5]])
  assert.equal(push.exercises[0].actual_note, 'felt "solid"')
}

function testHevyAndPounds() {
  const { format, sets } = parseHistoryCsv(HEVY)
  assert.equal(format, 'hevy')
  const [legs] = setsToSessions(sets, format)
  assert.equal(legs.duration_min, 70)
  assert.equal(legs.exercises[0].sets, 2)
  assert.equal(legs.exercises[0].actual_weight_kg, 100)

  const lbs = parseHistoryCsv('Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps\n2024-01-01 10:00:00,A,Curl,1,45,lbs,10')
  assert.equal(lbs.sets[0].weightKg, 20.5)
}

function testRejectsUnknownFiles() {
  assert.throws(() => parseHistoryCsv('foo,bar\n1,2'), /Not a Strong or Hevy/)
  assert.throws(() => parseHistoryCsv('Date,Exercise Name'), /no workout rows/)
}

function testWeeksAndPlan() {
  assert.equal(mondayOf('2024-03-14'), '2024-03-11')
  assert.equal(mondayOf('2024-03-11'), '2024-03-11')
  assert.equal(weekLabel('2024-03-11'), 'Mar 11–17, 2024')
  assert.equal(weekLabel('2024-03-25'), 'Mar 25–31, 2024')
  assert.equal(weekLabel('2024-04-29'), 'Apr 29 – May 5, 2024')

  const sessions = setsToSessions(parseHistoryCsv(STRONG).sets, 'strong')
  const athlete = { name: 'A', age: 30, weight_kg: 80, smm_kg: 0, bf_pct: 0, bmr_kcal: 0, rhr_bpm: 0, smm_target_kg: 0 }
  const plan = planImport(sessions, new Set(['2024-03-14']), athlete)
  assert.equal(plan.importedSessions, 1)
  assert.deepEqual(plan.skippedExistingDays, ['2024-03-14'])
  assert.equal(plan.weeks.length, 1)
  assert.equal(plan.weeks[0].id, 'archive-import-2024-03-11')
  assert.equal(plan.weeks[0].week.week_summary.total_sessions, 1)
  assert.deepEqual(plan.dateRange, ['2024-03-12', '2024-03-12'])
}

testCsvParsing()
testDetectAndDates()
testStrong()
testHevyAndPounds()
testRejectsUnknownFiles()
testWeeksAndPlan()
console.log('history-import tests passed')
