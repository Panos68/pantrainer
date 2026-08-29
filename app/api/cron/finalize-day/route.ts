import { fetchAndStoreRecovery, isMidDaySnapshot, isoDaysAgoInAppTimeZone } from '@/lib/garmin-recovery'
import { readCurrentWeekDirect } from '@/lib/data'

// Scheduled at 01:01 UTC (see vercel.json) = 03:01 Europe/Stockholm in summer,
// 02:01 in winter. Vercel crons are UTC-only, so this is deliberately not
// pinned to local midnight: such a schedule would fire before midnight on one
// side of the DST switch and finalize the wrong day.

// Garmin can lag a little at the day boundary; give the fetches room.
export const maxDuration = 120

// How many past days to repair. Yesterday is the point of the job; the extra
// days let a missed or failed run catch up on the next night instead of
// leaving a partial burn frozen in the week doc forever.
const LOOKBACK_DAYS = 3

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return Response.json({ error: 'Garmin credentials not configured' }, { status: 503 })
  }

  const week = await readCurrentWeekDirect()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const results: Array<{ date: string; status: string; total_kilocalories?: number | null }> = []

  for (let daysAgo = 1; daysAgo <= LOOKBACK_DAYS; daysAgo++) {
    const date = isoDaysAgoInAppTimeZone(daysAgo)

    // Only days the week doc actually tracks — don't backfill across a week rollover.
    if (!week.sessions?.some((s) => s.date === date)) {
      results.push({ date, status: 'not-in-current-week' })
      continue
    }

    const cached = week.garmin_recovery?.[date]
    // Yesterday is always re-fetched: it just ended, so whatever is cached was
    // necessarily captured mid-day. Older days only if still a partial snapshot.
    if (daysAgo > 1 && !isMidDaySnapshot(date, cached?.fetched_at)) {
      results.push({ date, status: 'already-final' })
      continue
    }

    try {
      const recovery = await fetchAndStoreRecovery(date)
      results.push({ date, status: 'refreshed', total_kilocalories: recovery.total_kilocalories })
    } catch (err) {
      console.error(`finalize-day: failed to refresh ${date}`, err)
      results.push({ date, status: 'failed' })
    }
  }

  return Response.json({ ok: true, results })
}
