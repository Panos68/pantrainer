import type { Session } from './schema'

export type LoadSource = 'garmin_tss' | 'hr_duration'

export interface TrainingLoadPoint {
  date: string
  type: string
  subtype: string | null
  duration_min: number
  avg_hr_bpm: number
  total_calories: number | null
  training_load: number
  load_source: LoadSource
}

export function calcLoad(s: Session): { load: number; source: LoadSource } | null {
  if (s.training_stress_score != null && s.training_stress_score > 0) {
    return { load: s.training_stress_score, source: 'garmin_tss' }
  }
  if (s.avg_hr_bpm != null && s.avg_hr_bpm > 0 && s.duration_min != null && s.duration_min > 0) {
    return { load: Math.round(s.avg_hr_bpm * s.duration_min), source: 'hr_duration' }
  }
  return null
}

export function sessionToLoadPoint(s: Session): TrainingLoadPoint | null {
  if (s.status !== 'completed') return null
  const result = calcLoad(s)
  if (!result) return null
  return {
    date: s.date,
    type: s.type,
    subtype: s.subtype ?? null,
    duration_min: s.duration_min!,
    avg_hr_bpm: s.avg_hr_bpm!,
    total_calories: s.total_calories ?? null,
    training_load: result.load,
    load_source: result.source,
  }
}
