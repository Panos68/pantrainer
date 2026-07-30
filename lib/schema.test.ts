import assert from 'node:assert/strict'
import { ExerciseSchema, SessionSchema, GarminRecoveryDaySchema } from './schema'

function run() {
  {
    const result = ExerciseSchema.safeParse({
      name: 'Back Squat',
      alternatives: [],
      set_log: [
        { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: '2026-07-14T10:00:00.000Z' },
        { reps: 8, weight_kg: 60, effort: 'hard', completed_at: '2026-07-14T10:05:00.000Z' },
      ],
    })
    assert.equal(result.success, true, 'accepts an exercise with a populated sets array')
  }
  {
    const result = ExerciseSchema.safeParse({ name: 'Bench Press', alternatives: [] })
    assert.equal(result.success, true, 'accepts an exercise with no sets field (backward compatibility)')
  }
  {
    const result = ExerciseSchema.safeParse({
      name: 'Back Squat',
      alternatives: [],
      set_log: [{ reps: 8, weight_kg: 60, effort: 'medium', completed_at: '2026-07-14T10:00:00.000Z' }],
    })
    assert.equal(result.success, false, 'rejects a set entry with an invalid effort value')
  }
  {
    // Old session document with no per_side/side fields must still parse unchanged.
    const legacySession = {
      date: '2026-07-14',
      day: 'Monday',
      type: 'Strength',
      exercises: [
        {
          name: 'Back Squat',
          sets: 3,
          reps: 8,
          weight_kg: 60,
          alternatives: [],
          set_log: [
            { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: '2026-07-14T10:00:00.000Z' },
          ],
        },
      ],
      status: 'completed',
      photos: [],
      muscle_groups: [],
    }
    const result = SessionSchema.safeParse(legacySession)
    assert.equal(result.success, true, 'legacy session without per_side/side still parses')
  }
  {
    // New fields parse when present.
    const result = ExerciseSchema.safeParse({
      name: 'Bulgarian Split Squat',
      alternatives: [],
      per_side: true,
      set_log: [
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: '2026-07-14T10:00:00.000Z', side: 'left' },
        { reps: 8, weight_kg: 20, effort: 'perfect', completed_at: '2026-07-14T10:01:00.000Z', side: 'right' },
      ],
    })
    assert.equal(result.success, true, 'accepts per_side exercise with side-tagged set_log entries')
  }
  {
    const result = GarminRecoveryDaySchema.safeParse({
      sleep_hours: 7.5,
      body_battery_charged: 51,
      body_battery_drained: 3,
      avg_stress_level: 17,
      max_stress_level: 69,
      vo2max: 57,
      fitness_age: 24.9,
      achievable_fitness_age: 27,
    })
    assert.equal(result.success, true, 'accepts a recovery day with all new extended metric fields populated')
    assert.equal(result.success && result.data.body_battery_charged, 51, 'body_battery_charged round-trips through the schema')
    assert.equal(result.success && result.data.vo2max, 57, 'vo2max round-trips through the schema')
  }
  {
    const result = GarminRecoveryDaySchema.safeParse({
      sleep_hours: 7.5,
    })
    assert.equal(result.success, true, 'accepts a recovery day with none of the new fields present (backward compatibility)')
  }
  {
    const result = GarminRecoveryDaySchema.safeParse({
      sleep_hours: 7.5,
      body_battery_charged: null,
      avg_stress_level: null,
      vo2max: null,
      fitness_age: null,
    })
    assert.equal(result.success, true, 'accepts explicit null for any new field (genuinely-no-data case)')
  }
  console.log('lib/schema.test.ts: all assertions passed')
}

run()
