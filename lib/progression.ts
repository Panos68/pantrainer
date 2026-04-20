import type { Exercise, LiftProgression } from './schema'

export function nameToKey(name: string): string {
  return (
    name
      .toLowerCase()
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
