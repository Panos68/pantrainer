import { fetchRecentMeasurements, type RenphoMeasurement } from './renpho'
import { readCurrentWeekDirect, writeCurrentWeek } from './data'
import { isoDateInAppTimeZone, todayIsoInAppTimeZone } from './app-timezone'
import { isoDaysAgoInAppTimeZone } from './recovery-freshness'
import type { RenphoMeasurementDay } from './schema'

function toDayEntry(m: RenphoMeasurement): RenphoMeasurementDay {
  return {
    weight_kg: m.weight ?? null,
    bmi: m.bmi,
    body_fat_pct: m.bodyfat,
    water_pct: m.water,
    muscle_kg: m.muscle,
    bone_kg: m.bone,
    bmr: m.bmr,
    visceral_fat: m.visceral_fat,
    protein_pct: m.protein,
    fetched_at: new Date().toISOString(),
  }
}

/**
 * Fetch the most recent Renpho measurements and bucket the latest reading
 * per calendar day (app time zone) onto the current week doc. Renpho has no
 * date-range query, so this always pulls the last raw readings off the
 * scale's own history — which, for an account with any older measurements
 * sitting in that table, keeps re-surfacing those same old dates on every
 * run. This is a once-a-day morning weigh-in, not a backfill job, so only
 * today and yesterday (a small buffer for a late/missed cron run) are ever
 * accepted — anything older is discarded even if it's technically within
 * the current week's date range.
 */
export async function fetchAndStoreRenphoMeasurements(): Promise<{ updated: string[] }> {
  const measurements = await fetchRecentMeasurements(30)
  if (!measurements.length) return { updated: [] }

  const week = await readCurrentWeekDirect()
  if (!week) return { updated: [] }

  const acceptedDates = new Set([todayIsoInAppTimeZone(), isoDaysAgoInAppTimeZone(1)])

  const latestPerDay = new Map<string, RenphoMeasurement>()
  for (const m of measurements) {
    const date = isoDateInAppTimeZone(new Date(m.time_stamp * 1000))
    if (!acceptedDates.has(date)) continue
    const existing = latestPerDay.get(date)
    if (!existing || m.time_stamp > existing.time_stamp) {
      latestPerDay.set(date, m)
    }
  }
  if (latestPerDay.size === 0) return { updated: [] }

  const renpho_measurements = { ...week.renpho_measurements }
  const updated: string[] = []
  for (const [date, m] of latestPerDay) {
    renpho_measurements[date] = toDayEntry(m)
    updated.push(date)
  }

  await writeCurrentWeek({ ...week, renpho_measurements })
  return { updated }
}
