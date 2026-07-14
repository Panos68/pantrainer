import assert from 'node:assert/strict'
import { ExerciseSchema } from './schema'

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
  console.log('lib/schema.test.ts: all assertions passed')
}

run()
