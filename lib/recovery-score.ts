import type { DailyReadiness, GarminRecoveryDay, RecoveryScoreBreakdown } from './schema'
import type { Baselines } from './baselines'

export const CONFIDENCE_FLOOR = 0.6

const HRV_WEIGHT = 25

type Component = { points: number; weight: number } | null

// Sleep (weight 25, internally scored 0-40 then rescaled): hours 0-30 linear
// (8h = 30, <4h = 0), deep sleep 0-10 (deepRatio/0.20 * 10, capped at 10).
// When deep-sleep data is missing, credit it as neutral (5/10) rather than
// zero — the old behavior silently capped every night without deep-sleep
// data at 75% of the sleep component regardless of how good the hours were.
function sleepComponent(garmin: GarminRecoveryDay | null): { component: Component; rawScore: number } {
  if (!garmin || garmin.sleep_hours == null) return { component: null, rawScore: 20 }
  const hours = garmin.sleep_hours
  const hoursScore = hours < 4 ? 0 : Math.min(30, (hours / 8) * 30)
  let deepScore: number
  if (garmin.deep_sleep_hours == null || hours === 0) {
    deepScore = 5
  } else {
    const deepRatio = garmin.deep_sleep_hours / hours
    deepScore = Math.min(10, (deepRatio / 0.2) * 10)
  }
  const rawScore = Math.round(hoursScore + deepScore) // 0-40
  return { component: { points: (rawScore / 40) * 25, weight: 25 }, rawScore }
}

// HRV (weight 25): scored against the athlete's own rolling baseline band
// (median ± spread), not an absolute number — a personal baseline is the
// only way HRV is interpretable across individuals.
function hrvComponent(garmin: GarminRecoveryDay | null, baselines: Baselines): Component {
  if (!garmin?.hrv_overnight_ms || !baselines.hrv) return null
  const { median, spread } = baselines.hrv
  if (spread === 0) return { points: garmin.hrv_overnight_ms >= median ? 25 : 12.5, weight: 25 }
  const z = (garmin.hrv_overnight_ms - median) / spread
  // z >= 0 (at/above personal baseline) = full points; below baseline scales
  // down linearly, floored at 0 by z = -2 (two MADs below baseline).
  const fraction = Math.max(0, Math.min(1, (z + 2) / 2))
  return { points: fraction * 25, weight: 25 }
}

// RHR (weight 20): vs rolling baseline when available (>=14 samples), else
// falls back to the static athlete.rhr_bpm — same delta shape as before
// (delta <= 0 = full points, delta >= 5 = 0, linear between), just rescaled
// from a 0-30 internal scale to weight 20.
function rhrComponent(rhrBpm: number | null | undefined, baselineRhr: number, baselines: Baselines): Component {
  if (rhrBpm == null) return null
  const baseline = baselines.rhr?.median ?? baselineRhr
  const delta = rhrBpm - baseline
  const raw = delta <= 0 ? 30 : delta >= 5 ? 0 : Math.max(0, 30 - delta * 6)
  return { points: (raw / 30) * 20, weight: 20 }
}

// Load (weight 20) based on ACWR: 0.8-1.0 = optimal (full points), >1.5 = 0,
// same shape as before, rescaled from 0-20 to weight 20 (i.e. unchanged).
function loadComponent(acwr: number | null): Component {
  if (acwr == null) return null
  if (acwr >= 0.8 && acwr <= 1.0) return { points: 20, weight: 20 }
  const raw = acwr > 1.0 ? Math.max(0, 20 - (acwr - 1.0) * 40) : Math.max(12, 20 - (0.8 - acwr) * 40)
  return { points: raw, weight: 20 }
}

// Subjective (weight 10): average of energy/sleep/mood (1-5 each) -> 0-10.
function subjectiveComponent(readiness: DailyReadiness | null): Component {
  if (!readiness) return null
  const avg = (readiness.energy_level + readiness.sleep_quality + readiness.mood) / 3
  return { points: (avg / 5) * 10, weight: 10 }
}

function labelFor(total: number): { label: 'Ready' | 'Moderate' | 'Rest'; color: 'green' | 'amber' | 'red' } {
  if (total >= 70) return { label: 'Ready', color: 'green' }
  if (total >= 40) return { label: 'Moderate', color: 'amber' }
  return { label: 'Rest', color: 'red' }
}

export function calcRecoveryScore(
  garmin: GarminRecoveryDay | null,
  baselineRhr: number,
  acwr: number | null,
  readiness: DailyReadiness | null,
  baselines: Baselines,
): RecoveryScoreBreakdown {
  const { component: sleepComp, rawScore: sleepRaw } = sleepComponent(garmin)
  const hrvComp = hrvComponent(garmin, baselines)
  const rhrComp = rhrComponent(garmin?.resting_hr_bpm, baselineRhr, baselines)
  const loadComp = loadComponent(acwr)
  const subjectiveComp = subjectiveComponent(readiness)

  const components = [sleepComp, hrvComp, rhrComp, loadComp, subjectiveComp]
  const totalWeight = components.reduce((sum, c) => sum + (c?.weight ?? 0), 0)
  const totalPoints = components.reduce((sum, c) => sum + (c?.points ?? 0), 0)
  const total = totalWeight > 0 ? Math.round((totalPoints / totalWeight) * 100) : 0

  // Confidence means "fraction of achievable signal present" — achievable,
  // not "all 5 components exist in principle". When this athlete's device
  // structurally never produces HRV (baselines.hrv is null — <14 samples
  // ever, not just missing today), the HRV component can never contribute,
  // so it must not count against the denominator either. Otherwise every
  // day is permanently capped at (100 - HRV_WEIGHT) / 100 confidence, and a
  // single other missing signal (no check-in, no ACWR history, a sync gap)
  // needlessly trips the confidence floor and suppresses the label/alert.
  const maxAchievableWeight = 100 - (baselines.hrv == null ? HRV_WEIGHT : 0)
  const confidence = maxAchievableWeight > 0 ? Math.round((totalWeight / maxAchievableWeight) * 100) / 100 : 0

  // Individual breakdown fields stay on their original display scales
  // (sleep 0-40, rhr 0-30, load 0-20, subjective 0-10) for UI/backward compat
  // with RecoveryScorePanel's existing bar maxes — only `total` and
  // `confidence` reflect the new weighted-redistribution math.
  const sleep = garmin ? sleepRaw : 20
  const rhr = rhrComp ? Math.round((rhrComp.points / 20) * 30) : 15
  const load = loadComp ? Math.round(loadComp.points) : 15
  const subjective = subjectiveComp ? Math.round((subjectiveComp.points / 10) * 10) : 5
  const hrv = hrvComp ? Math.round(hrvComp.points * 10) / 10 : null

  const { label, color } = labelFor(total)
  const showLabel = confidence >= CONFIDENCE_FLOOR

  return {
    total, sleep, rhr, load, subjective, hrv, confidence, version: 2,
    label: showLabel ? label : null,
    color: showLabel ? color : null,
  }
}
