import { fetchSleepData, fetchHRData } from '@/lib/garmin'
import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'

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

  // Return cached data if available and not forcing refresh
  const existing = week.garmin_recovery?.[date]
  if (existing && !force) {
    return Response.json({ recovery: existing, cached: true })
  }

  try {
    const [sleep, hr] = await Promise.allSettled([
      fetchSleepData(date),
      fetchHRData(date),
    ])

    const recovery = {
      sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.sleep_hours ?? null) : null,
      deep_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.deep_sleep_hours ?? null) : null,
      rem_sleep_hours: sleep.status === 'fulfilled' ? (sleep.value?.rem_sleep_hours ?? null) : null,
      resting_hr_bpm: hr.status === 'fulfilled' ? hr.value.resting_hr_bpm : null,
      max_hr_bpm: hr.status === 'fulfilled' ? hr.value.max_hr_bpm : null,
      fetched_at: new Date().toISOString(),
    }

    week.garmin_recovery = { ...week.garmin_recovery, [date]: recovery }
    await writeCurrentWeek(week)

    return Response.json({ recovery, cached: false })
  } catch (err) {
    console.error('Garmin recovery error:', err)
    return Response.json({ error: 'Failed to fetch recovery data from Garmin' }, { status: 502 })
  }
}
