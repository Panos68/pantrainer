import { fetchSleepData, fetchHRData, fetchBodyBattery, fetchStress, fetchVO2Max, fetchFitnessAge, fetchDailySummary } from './garmin'
import { readCurrentWeekDirect, writeCurrentWeek, readArchivedWeeks } from './data'
import { computeDailyScore } from './daily-score'
import { sanitizeRecovery, hasAnyRecoveryMetric, type SanitizedRecovery } from './recovery-freshness'

export { sanitizeRecovery, hasAnyRecoveryMetric, isMidDaySnapshot, isoDaysAgoInAppTimeZone } from './recovery-freshness'
export type { SanitizedRecovery } from './recovery-freshness'

/**
 * Fetch every recovery metric for `date` from Garmin and persist it on the
 * current week (also refreshing that day's daily score). Always hits Garmin —
 * callers decide whether a cached value is good enough.
 */
export async function fetchAndStoreRecovery(date: string): Promise<SanitizedRecovery> {
  const [sleep, hr, bodyBattery, stress, vo2max, fitnessAge, dailySummary] = await Promise.allSettled([
    fetchSleepData(date),
    fetchHRData(date),
    fetchBodyBattery(date),
    fetchStress(date),
    fetchVO2Max(date),
    fetchFitnessAge(date),
    fetchDailySummary(date),
  ])

  const recovery = sanitizeRecovery({
    sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.sleep_hours ?? null) : null,
    deep_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.deep_sleep_hours ?? null) : null,
    rem_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.rem_sleep_hours ?? null) : null,
    resting_hr_bpm: hr.status === 'fulfilled' ? hr.value.resting_hr_bpm : null,
    max_hr_bpm: hr.status === 'fulfilled' ? hr.value.max_hr_bpm : null,
    body_battery_charged: bodyBattery.status === 'fulfilled' ? (bodyBattery.value?.body_battery_charged ?? null) : null,
    body_battery_drained: bodyBattery.status === 'fulfilled' ? (bodyBattery.value?.body_battery_drained ?? null) : null,
    avg_stress_level: stress.status === 'fulfilled' ? (stress.value?.avg_stress_level ?? null) : null,
    max_stress_level: stress.status === 'fulfilled' ? (stress.value?.max_stress_level ?? null) : null,
    vo2max: vo2max.status === 'fulfilled' ? (vo2max.value?.vo2max ?? null) : null,
    fitness_age: fitnessAge.status === 'fulfilled' ? (fitnessAge.value?.fitness_age ?? null) : null,
    achievable_fitness_age: fitnessAge.status === 'fulfilled' ? (fitnessAge.value?.achievable_fitness_age ?? null) : null,
    total_kilocalories: dailySummary.status === 'fulfilled' ? (dailySummary.value?.total_kilocalories ?? null) : null,
    fetched_at: new Date().toISOString(),
  })

  // Cache whenever Garmin returns any usable recovery metric.
  // Re-read week before writing to avoid clobbering concurrent session writes
  // (e.g. "Mark Complete" PATCH racing with the initial background garmin fetch).
  if (hasAnyRecoveryMetric(recovery)) {
    const freshWeek = await readCurrentWeekDirect()
    if (freshWeek) {
      freshWeek.garmin_recovery = { ...freshWeek.garmin_recovery, [date]: recovery }
      try {
        const archivedWeeks = await readArchivedWeeks(8)
        const score = computeDailyScore(date, freshWeek, archivedWeeks)
        freshWeek.daily_scores = { ...freshWeek.daily_scores, [date]: score }
      } catch {
        // score persistence is best-effort
      }
      await writeCurrentWeek(freshWeek)
    }
  }

  return recovery
}
