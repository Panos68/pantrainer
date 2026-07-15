import assert from 'node:assert/strict'
import { ExerciseSchema, SessionSchema } from './schema'

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
  console.log('lib/schema.test.ts: all assertions passed')
}

run()
