import { fetchSleepData, fetchHRData, fetchBodyBattery, fetchStress, fetchVO2Max, fetchFitnessAge } from '@/lib/garmin'
import { readCurrentWeekDirect, writeCurrentWeek, readArchivedWeeks } from '@/lib/data'
import { computeDailyScore } from '@/lib/daily-score'

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function sanitizeRecovery(recovery: {
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
    fetched_at: recovery.fetched_at ?? new Date().toISOString(),
  }
}

function hasAnyRecoveryMetric(recovery: {
  sleep_hours: number | null
  deep_sleep_hours: number | null
  rem_sleep_hours: number | null
  resting_hr_bpm: number | null
  max_hr_bpm: number | null
  body_battery_charged: number | null
  body_battery_drained: number | null
  avg_stress_level: number | null
  max_stress_level: number | null
  vo2max: number | null
  fitness_age: number | null
  achievable_fitness_age: number | null
}) {
  return (
    recovery.sleep_hours != null ||
    recovery.deep_sleep_hours != null ||
    recovery.rem_sleep_hours != null ||
    recovery.resting_hr_bpm != null ||
    recovery.max_hr_bpm != null ||
    recovery.body_battery_charged != null ||
    recovery.body_battery_drained != null ||
    recovery.avg_stress_level != null ||
    recovery.max_stress_level != null ||
    recovery.vo2max != null ||
    recovery.fitness_age != null ||
    recovery.achievable_fitness_age != null
  )
}

export async function POST(req: Request) {
  const body = await req.json() as { date?: string; force?: boolean }
  const { date, force = false } = body

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return Response.json({ error: 'Garmin credentials not configured' }, { status: 503 })
  }

  const week = await readCurrentWeekDirect()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const existingRaw = week.garmin_recovery?.[date]
  const existing = existingRaw ? sanitizeRecovery(existingRaw) : null

  // Return cached data if available, not forcing refresh, and sleep is present.
  // If sleep is missing from cache, fall through to re-fetch so it gets another chance.
  if (existing && existing.sleep_hours != null && !force) {
    if (existingRaw && JSON.stringify(existingRaw) !== JSON.stringify(existing)) {
      // Sanitize stale entry in place — tiny window, no concurrent write concern here
      week.garmin_recovery = { ...week.garmin_recovery, [date]: existing }
      await writeCurrentWeek(week)
    }
    return Response.json({ recovery: existing, cached: true })
  }

  try {
    const [sleep, hr, bodyBattery, stress, vo2max, fitnessAge] = await Promise.allSettled([
      fetchSleepData(date),
      fetchHRData(date),
      fetchBodyBattery(date),
      fetchStress(date),
      fetchVO2Max(date),
      fetchFitnessAge(date),
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

    return Response.json({
      recovery,
      cached: false,
      debug: {
        sleep_status: sleep.status,
        sleep_raw: sleep.status === 'fulfilled' ? sleep.value : String((sleep as PromiseRejectedResult).reason),
        hr_status: hr.status,
        hr_raw: hr.status === 'fulfilled' ? hr.value : String((hr as PromiseRejectedResult).reason),
        body_battery_status: bodyBattery.status,
        stress_status: stress.status,
        vo2max_status: vo2max.status,
        fitness_age_status: fitnessAge.status,
      },
    })
  } catch (err) {
    console.error('Garmin recovery error:', err)
    return Response.json({ error: 'Failed to fetch recovery data from Garmin' }, { status: 502 })
  }
}
