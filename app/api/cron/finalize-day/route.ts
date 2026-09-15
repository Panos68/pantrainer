import { list, del } from '@vercel/blob'
import { fetchAndStoreRecovery, isMidDaySnapshot, isoDaysAgoInAppTimeZone } from '@/lib/garmin-recovery'
import { readCurrentWeekDirect, deleteCoachNote, readNutritionLogForRange } from '@/lib/data'
import { selectFoodPhotosToDelete } from '@/lib/food-photo-cleanup'

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

// Food photos are kept for 2 weeks after they've been folded into a saved
// nutrition estimate — long enough to review or re-check a day, short enough
// to keep Blob storage/transfer bounded. Pending (not yet analyzed) photos
// are never swept, regardless of age.
const FOOD_PHOTO_RETENTION_DAYS = 14

// Vercel Hobby plans cap the number of cron jobs, so this piggybacks on the
// existing daily finalize-day run instead of registering a separate cron.
async function cleanupOldFoodPhotos(): Promise<{ deleted: number; scanned: number } | { error: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: 'BLOB_READ_WRITE_TOKEN is not configured' }
  }

  const cutoffDate = isoDaysAgoInAppTimeZone(FOOD_PHOTO_RETENTION_DAYS)

  const pathnames: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({
      prefix: 'data/food-photos/',
      cursor,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    pathnames.push(...page.blobs.map((b) => b.pathname))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  // Nutrition-log entries are keyed by date string, so any date far enough
  // back covers the full history of entries that could still be pending
  // deletion (earlier ones were already swept on a prior day's run).
  const entries = await readNutritionLogForRange('0000-01-01', cutoffDate)
  const analyzedPathnames = new Set(entries.flatMap((e) => e.analyzedPhotoPathnames ?? []))

  const toDelete = selectFoodPhotosToDelete(pathnames, analyzedPathnames, cutoffDate)
  if (toDelete.length > 0) {
    await del(toDelete, { token: process.env.BLOB_READ_WRITE_TOKEN })
  }

  return { deleted: toDelete.length, scanned: pathnames.length }
}

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

    // Yesterday just closed out — any mid-day coach note for it was written
    // against a partial, no-balance-yet day, so it's stale the moment the
    // real deficit/surplus is available. Clear it regardless of whether the
    // recovery refetch below succeeds; it's a no-op if none was ever saved.
    if (daysAgo === 1) {
      await deleteCoachNote(date).catch(() => {})
    }

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

  let foodPhotoCleanup: Awaited<ReturnType<typeof cleanupOldFoodPhotos>>
  try {
    foodPhotoCleanup = await cleanupOldFoodPhotos()
  } catch (err) {
    console.error('finalize-day: food photo cleanup failed', err)
    foodPhotoCleanup = { error: err instanceof Error ? err.message : 'unknown error' }
  }

  return Response.json({ ok: true, results, foodPhotoCleanup })
}
