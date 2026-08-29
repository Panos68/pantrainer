// Pure helpers for reasoning about how complete a cached Garmin recovery entry
// is. Deliberately free of DB/network imports so they stay directly testable.
import { APP_TIMEZONE } from './app-timezone'

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
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
