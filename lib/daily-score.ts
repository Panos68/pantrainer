import { calcRecoveryScore } from './recovery-score'
import { calcBaselines } from './baselines'
import { sessionToLoadPoint } from './training-load'
import type { WeekDoc, RecoveryScoreBreakdown } from './schema'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'

type LoadPoint = NonNullable<ReturnType<typeof sessionToLoadPoint>>

export function calcACWR(loadPoints: LoadPoint[], asOfDate: string): number | null {
  if (loadPoints.length < 3) return null
  const sorted = [...loadPoints].sort((a, b) => a.date.localeCompare(b.date))
  const oldest = parseISO(sorted[0].date)
  const latest = parseISO(asOfDate)
  if (differenceInDays(latest, oldest) < 21) return null
  const acuteStart = format(subDays(latest, 6), 'yyyy-MM-dd')
  const chronicStart = format(subDays(latest, 27), 'yyyy-MM-dd')
  const acute = sorted.filter((p) => p.date >= acuteStart && p.date <= asOfDate).reduce((s, p) => s + p.training_load, 0)
  const chronicPoints = sorted.filter((p) => p.date >= chronicStart && p.date <= asOfDate)
  const chronic = chronicPoints.length > 0 ? chronicPoints.reduce((s, p) => s + p.training_load, 0) / 4 : null
  if (!chronic || chronic === 0) return null
  return Math.round((acute / chronic) * 100) / 100
}

export function computeDailyScore(
  date: string,
  week: WeekDoc,
  archivedWeeks: WeekDoc[],
): RecoveryScoreBreakdown {
  const athlete = { rhr: week.athlete.rhr_bpm, maxHr: 220 - week.athlete.age }
  const allSessions = [...archivedWeeks.flatMap((w) => w.sessions), ...week.sessions]
  const loadPoints = allSessions
    .filter((s) => s.status === 'completed' && s.date <= date)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is LoadPoint => p !== null)

  const acwr = calcACWR(loadPoints, date)
  const garmin = week.garmin_recovery?.[date] ?? null
  const readiness = week.daily_readiness?.[date] ?? null
  const baselines = calcBaselines(date, [...archivedWeeks, week])

  return calcRecoveryScore(garmin, week.athlete.rhr_bpm, acwr, readiness, baselines)
}
