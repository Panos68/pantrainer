import { fetchRecentMeasurements, type RenphoMeasurement } from './renpho'
import { readCurrentWeekDirect, writeCurrentWeek } from './data'
import { isoDateInAppTimeZone } from './app-timezone'
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
 * date-range query, so this always pulls a fixed recent window and lets
 * callers rely on "most recent measurement wins" per day.
 */
export async function fetchAndStoreRenphoMeasurements(): Promise<{ updated: string[] }> {
  const measurements = await fetchRecentMeasurements(30)
  if (!measurements.length) return { updated: [] }

  const latestPerDay = new Map<string, RenphoMeasurement>()
  for (const m of measurements) {
    const date = isoDateInAppTimeZone(new Date(m.time_stamp * 1000))
    const existing = latestPerDay.get(date)
    if (!existing || m.time_stamp > existing.time_stamp) {
      latestPerDay.set(date, m)
    }
  }

  const week = await readCurrentWeekDirect()
  if (!week) return { updated: [] }

  const renpho_measurements = { ...week.renpho_measurements }
  const updated: string[] = []
  for (const [date, m] of latestPerDay) {
    renpho_measurements[date] = toDayEntry(m)
    updated.push(date)
  }

  await writeCurrentWeek({ ...week, renpho_measurements })
  return { updated }
}
