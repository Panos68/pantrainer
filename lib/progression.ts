import type { Exercise, LiftProgression } from './schema'

// Maps exercise names (lowercase, partial) to the canonical lift_progression keys
// used by the charts. More-specific patterns must come before generic ones.
// Add entries here when new tracked lifts are introduced.
const EXERCISE_NAME_TO_KEY: Array<[pattern: string, key: string]> = [
  ['incline dumbbell bench', 'incline_db_kg'],
  ['incline dumbell bench', 'incline_db_kg'],
  ['incline db bench', 'incline_db_kg'],
  ['dumbbell bench press', 'sunday_db_bench_kg'],
  ['dumbell bench press', 'sunday_db_bench_kg'],
  ['db bench press', 'sunday_db_bench_kg'],
  ['romanian deadlift', 'romanian_deadlift_kg'],
  ['barbell deadlift', 'deadlift_kg'],
  ['barbell bench press', 'bench_press_kg'],
  ['deadlift', 'deadlift_kg'],
  ['weighted pull', 'weighted_pullups_added_kg'],
  ['bench press', 'bench_press_kg'],
  ['push press', 'push_press_kg'],
  ['overhead press', 'push_press_kg'],
  ['ohp', 'push_press_kg'],
]

export function nameToKey(name: string): string {
  const lower = name.toLowerCase()
  const isDumbbellBench =
    lower.includes('bench') &&
    (lower.includes('dumbbell') || lower.includes('dumbell') || /\bdb\b/.test(lower))
  if (isDumbbellBench) return 'sunday_db_bench_kg'

  for (const [pattern, key] of EXERCISE_NAME_TO_KEY) {
    if (lower.includes(pattern)) return key
  }
  return (
    lower
      .replace(/[\s\-\/]+/g, '_')
      .replace(/[^a-z0-9_]/g, '') + '_kg'
  )
}

export function updateLiftProgression(
  exercises: Exercise[],
  current: LiftProgression,
): LiftProgression {
  const updated = { ...current }
  for (const ex of exercises) {
    if (ex.actual_weight_kg != null) {
      const key = nameToKey(ex.name)
      updated[key] = ex.actual_weight_kg
    }
  }
  return updated
}
