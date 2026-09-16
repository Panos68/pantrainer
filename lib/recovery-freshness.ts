// Pure helpers for reasoning about how complete a cached Garmin recovery entry
// is. Deliberately free of DB/network imports so they stay directly testable.
import { APP_TIMEZONE } from './app-timezone'

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function nonNegativeOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function stringOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export type SanitizedRecovery = ReturnType<typeof sanitizeRecovery>

export function sanitizeRecovery(recovery: {
  sleep_hours?: number | null
  deep_sleep_hours?: number | null
  rem_sleep_hours?: number | null
  resting_hr_bpm?: number | null
  max_hr_bpm?: number | null
  body_battery_charged?: number | null
  body_battery_drained?: number | null
  avg_stress_level?: number | null
  max_stress_level?: number | null
  vo2max?: number | null
  fitness_age?: number | null
  achievable_fitness_age?: number | null
  total_kilocalories?: number | null
  hrv_overnight_ms?: number | null
  hrv_status?: string | null
  sleep_score?: number | null
  avg_sleep_stress?: number | null
  awake_count?: number | null
  respiration_avg?: number | null
  hrv_baseline_low?: number | null
  hrv_baseline_high?: number | null
  spo2_avg?: number | null
  fetched_at?: string
}) {
  return {
    sleep_hours: positiveOrNull(recovery.sleep_hours),
    deep_sleep_hours: positiveOrNull(recovery.deep_sleep_hours),
    rem_sleep_hours: positiveOrNull(recovery.rem_sleep_hours),
    resting_hr_bpm: positiveOrNull(recovery.resting_hr_bpm),
    max_hr_bpm: positiveOrNull(recovery.max_hr_bpm),
    body_battery_charged: positiveOrNull(recovery.body_battery_charged),
    body_battery_drained: positiveOrNull(recovery.body_battery_drained),
    avg_stress_level: recovery.avg_stress_level != null && recovery.avg_stress_level >= 0 ? recovery.avg_stress_level : null,
    max_stress_level: recovery.max_stress_level != null && recovery.max_stress_level >= 0 ? recovery.max_stress_level : null,
    vo2max: positiveOrNull(recovery.vo2max),
    fitness_age: positiveOrNull(recovery.fitness_age),
    achievable_fitness_age: positiveOrNull(recovery.achievable_fitness_age),
    total_kilocalories: positiveOrNull(recovery.total_kilocalories),
    hrv_overnight_ms: positiveOrNull(recovery.hrv_overnight_ms),
    hrv_status: stringOrNull(recovery.hrv_status),
    sleep_score: positiveOrNull(recovery.sleep_score),
    avg_sleep_stress: recovery.avg_sleep_stress != null && recovery.avg_sleep_stress >= 0 ? recovery.avg_sleep_stress : null,
    awake_count: nonNegativeOrNull(recovery.awake_count),
    respiration_avg: positiveOrNull(recovery.respiration_avg),
    hrv_baseline_low: positiveOrNull(recovery.hrv_baseline_low),
    hrv_baseline_high: positiveOrNull(recovery.hrv_baseline_high),
    spo2_avg: positiveOrNull(recovery.spo2_avg),
    fetched_at: recovery.fetched_at ?? new Date().toISOString(),
  }
}

export function hasAnyRecoveryMetric(recovery: SanitizedRecovery): boolean {
  return Object.entries(recovery).some(([key, value]) => key !== 'fetched_at' && value != null)
}

function isoDateInAppTimeZone(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** ISO date `daysAgo` days before now, resolved in the app time zone. */
export function isoDaysAgoInAppTimeZone(daysAgo: number): string {
  return isoDateInAppTimeZone(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000))
}

/**
 * True when the cached entry for `date` was captured *during* that day, so
 * accumulating metrics (total_kilocalories above all, plus Body Battery and
 * stress) are partial running totals rather than the day's final figures.
 * A missing or unparseable timestamp counts as stale.
 */
export function isMidDaySnapshot(date: string, fetchedAt: string | null | undefined): boolean {
  if (!fetchedAt) return true
  const parsed = new Date(fetchedAt)
  if (Number.isNaN(parsed.getTime())) return true
  return isoDateInAppTimeZone(parsed) <= date
}
