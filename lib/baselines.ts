// Pure, DB/network-free — matches lib/recovery-freshness.ts's style. Rolling
// personal baselines for RHR/HRV/sleep, computed from persisted recovery
// history rather than a single static athlete profile value.
import { format, subDays, parseISO } from 'date-fns'
import type { WeekDoc } from './schema'

export type BaselineStat = { median: number; spread: number; n: number } | null

export type Baselines = {
  rhr: BaselineStat
  hrv: BaselineStat
  sleep_hours: BaselineStat
}

const WINDOW_DAYS = 28
const MIN_SAMPLES = 14

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Median Absolute Deviation, scaled by 1.4826 to be a robust estimator
// comparable to standard deviation for roughly-normal data.
function medianAbsoluteDeviation(values: number[], med: number): number {
  const deviations = values.map((v) => Math.abs(v - med))
  return median(deviations) * 1.4826
}

function statFor(values: number[]): BaselineStat {
  if (values.length < MIN_SAMPLES) return null
  const med = median(values)
  return { median: med, spread: medianAbsoluteDeviation(values, med), n: values.length }
}

export function calcBaselines(date: string, allWeeks: WeekDoc[]): Baselines {
  const windowStart = format(subDays(parseISO(date), WINDOW_DAYS), 'yyyy-MM-dd')

  const recoveryByDate = new Map<string, WeekDoc['garmin_recovery'][string]>()
  for (const week of allWeeks) {
    for (const [d, entry] of Object.entries(week.garmin_recovery ?? {})) {
      if (d >= windowStart && d < date) recoveryByDate.set(d, entry)
    }
  }

  const rhrValues: number[] = []
  const hrvValues: number[] = []
  const sleepValues: number[] = []
  for (const entry of recoveryByDate.values()) {
    if (typeof entry.resting_hr_bpm === 'number') rhrValues.push(entry.resting_hr_bpm)
    if (typeof entry.hrv_overnight_ms === 'number') hrvValues.push(entry.hrv_overnight_ms)
    if (typeof entry.sleep_hours === 'number') sleepValues.push(entry.sleep_hours)
  }

  return {
    rhr: statFor(rhrValues),
    hrv: statFor(hrvValues),
    sleep_hours: statFor(sleepValues),
  }
}
