import type { Session } from './schema'

export type LoadSource = 'garmin_tss' | 'trimp' | 'hr_duration'

export interface AthleteLoadParams {
  rhr: number
  maxHr: number
}

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

// TRIMP (Training Impulse) — Bannister formula.
// Produces values comparable to Garmin TSS (typically 30–150 per session).
function calcTrimp(durationMin: number, avgHr: number, rhr: number, maxHr: number): number {
  const hrReserve = maxHr - rhr
  if (hrReserve <= 0) return 0
  const hrRatio = Math.min(Math.max((avgHr - rhr) / hrReserve, 0), 1)
  const trimp = durationMin * hrRatio * 0.64 * Math.exp(1.92 * hrRatio)
  return Math.round(trimp)
}

export function calcLoad(
  s: Session,
  athlete?: AthleteLoadParams,
): { load: number; source: LoadSource } | null {
  // Garmin TSS is authoritative when available
  if (s.training_stress_score != null && s.training_stress_score > 0) {
    return { load: s.training_stress_score, source: 'garmin_tss' }
  }

  if (s.avg_hr_bpm != null && s.avg_hr_bpm > 0 && s.duration_min != null && s.duration_min > 0) {
    if (athlete) {
      // TRIMP with known resting/max HR — comparable scale to TSS
      const load = calcTrimp(s.duration_min, s.avg_hr_bpm, athlete.rhr, athlete.maxHr)
      return { load, source: 'trimp' }
    }
    // Normalized fallback when athlete params unavailable: duration × (hr/170)
    // Produces ~30–80 per session — reasonable relative values, not TSS-accurate
    const load = Math.round(s.duration_min * (s.avg_hr_bpm / 170))
    return { load, source: 'hr_duration' }
  }

  return null
}

export function sessionToLoadPoint(s: Session, athlete?: AthleteLoadParams): TrainingLoadPoint | null {
  if (s.status !== 'completed') return null
  const result = calcLoad(s, athlete)
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
