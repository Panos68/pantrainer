import { fetchSleepData, fetchHRData } from '@/lib/garmin'
import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function sanitizeRecovery(recovery: {
  sleep_hours?: number | null
  deep_sleep_hours?: number | null
  rem_sleep_hours?: number | null
  resting_hr_bpm?: number | null
  max_hr_bpm?: number | null
  fetched_at?: string
}) {
  return {
    sleep_hours: positiveOrNull(recovery.sleep_hours),
    deep_sleep_hours: positiveOrNull(recovery.deep_sleep_hours),
    rem_sleep_hours: positiveOrNull(recovery.rem_sleep_hours),
    resting_hr_bpm: positiveOrNull(recovery.resting_hr_bpm),
    max_hr_bpm: positiveOrNull(recovery.max_hr_bpm),
    fetched_at: recovery.fetched_at ?? new Date().toISOString(),
  }
}

function hasAnyRecoveryMetric(recovery: {
  sleep_hours: number | null
  deep_sleep_hours: number | null
  rem_sleep_hours: number | null
  resting_hr_bpm: number | null
  max_hr_bpm: number | null
}) {
  return (
    recovery.sleep_hours != null ||
    recovery.deep_sleep_hours != null ||
    recovery.rem_sleep_hours != null ||
    recovery.resting_hr_bpm != null ||
    recovery.max_hr_bpm != null
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

  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const existingRaw = week.garmin_recovery?.[date]
  const existing = existingRaw ? sanitizeRecovery(existingRaw) : null
  let weekMutated = false
  if (existingRaw && existing && JSON.stringify(existingRaw) !== JSON.stringify(existing)) {
    week.garmin_recovery = { ...week.garmin_recovery, [date]: existing }
    weekMutated = true
  }

  // Return cached data if available, not forcing refresh, and sleep is present.
  // If sleep is missing from cache, fall through to re-fetch so it gets another chance.
  if (existing && existing.sleep_hours != null && !force) {
    if (weekMutated) {
      await writeCurrentWeek(week)
    }
    return Response.json({ recovery: existing, cached: true })
  }

  try {
    const [sleep, hr] = await Promise.allSettled([
      fetchSleepData(date),
      fetchHRData(date),
    ])

    const recovery = sanitizeRecovery({
      sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.sleep_hours ?? null) : null,
      deep_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.deep_sleep_hours ?? null) : null,
      rem_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.rem_sleep_hours ?? null) : null,
      resting_hr_bpm: hr.status === 'fulfilled' ? hr.value.resting_hr_bpm : null,
      max_hr_bpm: hr.status === 'fulfilled' ? hr.value.max_hr_bpm : null,
      fetched_at: new Date().toISOString(),
    })

    // Cache whenever Garmin returns any usable recovery metric.
    // This avoids "looks fetched in UI but gone on Home" when sleep is missing but HR exists.
    if (hasAnyRecoveryMetric(recovery)) {
      week.garmin_recovery = { ...week.garmin_recovery, [date]: recovery }
      weekMutated = true
    }

    if (weekMutated) {
      await writeCurrentWeek(week)
    }

    return Response.json({ recovery, cached: false })
  } catch (err) {
    console.error('Garmin recovery error:', err)
    return Response.json({ error: 'Failed to fetch recovery data from Garmin' }, { status: 502 })
  }
}
