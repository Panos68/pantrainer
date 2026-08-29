import { fetchAndStoreRecovery, sanitizeRecovery, isMidDaySnapshot } from '@/lib/garmin-recovery'
import { readCurrentWeekDirect, writeCurrentWeek } from '@/lib/data'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'

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
  //
  // A past day cached from a mid-day snapshot also falls through: accumulating
  // metrics (total_kilocalories above all) were only partial at that point, and
  // leaving them frozen makes the calorie balance read as a phantom surplus.
  // For today they're expected to be partial, so today stays cached.
  const staleMidDaySnapshot = date < todayIsoInAppTimeZone() && isMidDaySnapshot(date, existing?.fetched_at)
  if (existing && existing.sleep_hours != null && !force && !staleMidDaySnapshot) {
    if (existingRaw && JSON.stringify(existingRaw) !== JSON.stringify(existing)) {
      // Sanitize stale entry in place — tiny window, no concurrent write concern here
      week.garmin_recovery = { ...week.garmin_recovery, [date]: existing }
      await writeCurrentWeek(week)
    }
    return Response.json({ recovery: existing, cached: true })
  }

  try {
    const recovery = await fetchAndStoreRecovery(date)
    return Response.json({ recovery, cached: false })
  } catch (err) {
    console.error('Garmin recovery error:', err)
    return Response.json({ error: 'Failed to fetch recovery data from Garmin' }, { status: 502 })
  }
}
