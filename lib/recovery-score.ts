import type { DailyReadiness, GarminRecoveryDay } from './schema'

export interface RecoveryScoreBreakdown {
  total: number          // 0–100
  sleep: number          // 0–40
  rhr: number            // 0–30
  load: number           // 0–20
  subjective: number     // 0–10
  label: 'Ready' | 'Moderate' | 'Rest'
  color: 'green' | 'amber' | 'red'
}

// Sleep score (0–40):
//   Hours component (0–30): linear scale, 8h = 30pts, <4h = 0pts
//   Deep sleep component (0–10): deepRatio / 0.20 * 10, capped at 10
function calcSleepScore(garmin: GarminRecoveryDay): number {
  if (garmin.sleep_hours == null) return 20

  const hours = garmin.sleep_hours
  const hoursScore = hours < 4 ? 0 : Math.min(30, (hours / 8) * 30)

  if (!garmin.deep_sleep_hours || hours === 0) {
    return Math.round(hoursScore)
  }
  const deepRatio = garmin.deep_sleep_hours / garmin.sleep_hours
  const deepScore = Math.min(10, (deepRatio / 0.2) * 10)
  return Math.round(hoursScore + deepScore)
}

// RHR score (0–30): delta ≤ 0 = 30pts, ≥+5 = 0pts, linear between
function calcRhrScore(rhrBpm: number | null | undefined, baselineRhr: number): number {
  if (rhrBpm == null) return 15
  const delta = rhrBpm - baselineRhr
  if (delta <= 0) return 30
  if (delta >= 5) return 0
  return Math.round(Math.max(0, 30 - delta * 6))
}

// Load score (0–20) based on ACWR: 0.8–1.0 = optimal (20pts), >1.5 = 0pts, null = neutral (15pts)
function calcLoadScore(acwr: number | null): number {
  if (acwr == null) return 15
  if (acwr >= 0.8 && acwr <= 1.0) return 20
  if (acwr > 1.0) return Math.round(Math.max(0, 20 - (acwr - 1.0) * 40))
  return Math.round(Math.max(12, 20 - (0.8 - acwr) * 40))
}

// Subjective score (0–10): average of energy/sleep/mood (1–5 each) mapped to 0–10
function calcSubjectiveScore(readiness: DailyReadiness | null): number {
  if (!readiness) return 5
  const avg = (readiness.energy_level + readiness.sleep_quality + readiness.mood) / 3
  return Math.round((avg / 5) * 10)
}

export function calcRecoveryScore(
  garmin: GarminRecoveryDay | null,
  baselineRhr: number,
  acwr: number | null,
  readiness: DailyReadiness | null
): RecoveryScoreBreakdown {
  const sleep = garmin ? calcSleepScore(garmin) : 20
  const rhr = calcRhrScore(garmin?.resting_hr_bpm, baselineRhr)
  const load = calcLoadScore(acwr)
  const subjective = calcSubjectiveScore(readiness)
  const total = sleep + rhr + load + subjective

  const label = total >= 70 ? 'Ready' : total >= 40 ? 'Moderate' : 'Rest'
  const color = total >= 70 ? 'green' : total >= 40 ? 'amber' : 'red'

  return { total, sleep, rhr, load, subjective, label, color }
}
