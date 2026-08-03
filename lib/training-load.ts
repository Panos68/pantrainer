import type { Session } from './schema'
import { todayIsoInAppTimeZone } from './app-timezone'

export type LoadSource = 'garmin_tss' | 'blended' | 'srpe' | 'trimp' | 'hr_duration'

export interface AthleteLoadParams {
  rhr: number
  maxHr: number
}

export interface TrainingLoadPoint {
  date: string
  type: string
  subtype: string | null
  duration_min: number
  avg_hr_bpm: number | null
  total_calories: number | null
  training_load: number
  load_source: LoadSource
  rpe: number | null
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

// Session-RPE (Foster method): duration_min * RPE (0-10 CR10 scale).
// HR-average-derived load can't tell a steady moderate effort from a
// stop-start-sprint-drift one of the same duration/avg HR — RPE captures the
// athlete's actual perceived effort instead. Divided by 4 to sit on the same
// ~1-2/min scale as TRIMP/Garmin TSS, so acute:chronic sums stay comparable
// across sessions that used different load sources.
function calcSessionRpeLoad(durationMin: number, rpe: number): number {
  return Math.round((durationMin * rpe) / 4)
}

function calcHrLoad(durationMin: number, avgHr: number, athlete?: AthleteLoadParams): number {
  if (athlete) {
    // TRIMP with known resting/max HR — comparable scale to TSS
    return calcTrimp(durationMin, avgHr, athlete.rhr, athlete.maxHr)
  }
  // Normalized fallback when athlete params unavailable: duration × (hr/170)
  // Produces ~30–80 per session — reasonable relative values, not TSS-accurate
  return Math.round(durationMin * (avgHr / 170))
}

export function calcLoad(
  s: Session,
  athlete?: AthleteLoadParams,
): { load: number; source: LoadSource } | null {
  // Garmin TSS is authoritative when available
  if (s.training_stress_score != null && s.training_stress_score > 0) {
    return { load: s.training_stress_score, source: 'garmin_tss' }
  }

  const hasRpe = s.rpe != null && s.rpe > 0 && s.duration_min != null && s.duration_min > 0
  const hasHr = s.avg_hr_bpm != null && s.avg_hr_bpm > 0 && s.duration_min != null && s.duration_min > 0

  // RPE captures perceived effort HR alone can miss (resistance work, stop-start
  // efforts); HR captures physiological strain RPE can under/over-report. Blend
  // both when available so neither signal alone determines the number.
  if (hasRpe && hasHr) {
    const rpeLoad = calcSessionRpeLoad(s.duration_min!, s.rpe!)
    const hrLoad = calcHrLoad(s.duration_min!, s.avg_hr_bpm!, athlete)
    return { load: Math.round((rpeLoad + hrLoad) / 2), source: 'blended' }
  }

  if (hasRpe) {
    return { load: calcSessionRpeLoad(s.duration_min!, s.rpe!), source: 'srpe' }
  }

  if (hasHr) {
    const source: LoadSource = athlete ? 'trimp' : 'hr_duration'
    return { load: calcHrLoad(s.duration_min!, s.avg_hr_bpm!, athlete), source }
  }

  return null
}

export function sessionToLoadPoint(s: Session, athlete?: AthleteLoadParams): TrainingLoadPoint | null {
  if (s.date > todayIsoInAppTimeZone()) return null
  if (s.status !== 'completed') return null
  const result = calcLoad(s, athlete)
  if (!result) return null
  return {
    date: s.date,
    type: s.type,
    subtype: s.subtype ?? null,
    duration_min: s.duration_min!,
    avg_hr_bpm: s.avg_hr_bpm ?? null,
    total_calories: s.total_calories ?? null,
    training_load: result.load,
    load_source: result.source,
    rpe: s.rpe ?? null,
  }
}
