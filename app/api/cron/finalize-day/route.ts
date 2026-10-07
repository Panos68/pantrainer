import { getStorage, STORAGE_NOT_CONFIGURED } from '@/lib/storage'
import { fetchAndStoreRecovery, isMidDaySnapshot, isoDaysAgoInAppTimeZone } from '@/lib/garmin-recovery'
import { readCurrentWeekDirect, deleteCoachNote, readNutritionLogForRange } from '@/lib/data'
import { selectFoodPhotosToDelete } from '@/lib/food-photo-cleanup'
import { isCronAuthorized } from '@/lib/automation-auth'

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
  const storage = getStorage()
  if (!storage) {
    return { error: STORAGE_NOT_CONFIGURED }
  }

  const cutoffDate = isoDaysAgoInAppTimeZone(FOOD_PHOTO_RETENTION_DAYS)

  const pathnames = (await storage.list('data/food-photos/')).map((o) => o.pathname)

  // Nutrition-log entries are keyed by date string, so any date far enough
  // back covers the full history of entries that could still be pending
  // deletion (earlier ones were already swept on a prior day's run).
  const entries = await readNutritionLogForRange('0000-01-01', cutoffDate)
  const analyzedPathnames = new Set(entries.flatMap((e) => e.analyzedPhotoPathnames ?? []))

  const toDelete = selectFoodPhotosToDelete(pathnames, analyzedPathnames, cutoffDate)
  if (toDelete.length > 0) {
    await storage.del(toDelete)
  }

  return { deleted: toDelete.length, scanned: pathnames.length }
}


export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Yesterday just closed out — any mid-day coach note for it was written
  // against a partial, no-balance-yet day, so it's stale the moment the real
  // deficit/surplus is available. Clear it whether or not Garmin is set up;
  // it's a no-op if none was ever saved.
  await deleteCoachNote(isoDaysAgoInAppTimeZone(1)).catch(() => {})

  // Garmin finalisation is optional; the photo cleanup below runs regardless.
  const garminConfigured = Boolean(process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD)
  const week = garminConfigured ? await readCurrentWeekDirect() : null

  const results: Array<{ date: string; status: string; total_kilocalories?: number | null }> = []

  for (let daysAgo = 1; week && daysAgo <= LOOKBACK_DAYS; daysAgo++) {
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

  let foodPhotoCleanup: Awaited<ReturnType<typeof cleanupOldFoodPhotos>>
  try {
    foodPhotoCleanup = await cleanupOldFoodPhotos()
  } catch (err) {
    console.error('finalize-day: food photo cleanup failed', err)
    foodPhotoCleanup = { error: err instanceof Error ? err.message : 'unknown error' }
  }

  return Response.json({
    ok: true,
    garmin: garminConfigured ? (week ? 'finalized' : 'no-active-week') : 'not-configured',
    results,
    foodPhotoCleanup,
  })
}
