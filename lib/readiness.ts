import type { WeekDoc, AthleteProfile, GarminRecoveryDay, DailyReadiness, RecoveryScoreBreakdown } from './schema'
import { calcRecoveryScore } from './recovery-score'
import { calcACWR } from './daily-score'
import { sessionToLoadPoint } from './training-load'

export interface ReadinessSnapshot {
  date: string
  score: RecoveryScoreBreakdown
  readiness: DailyReadiness | null
  garmin: GarminRecoveryDay | null
  sleep_avg_7d: number | null
  has_garmin_sleep: boolean
}

export function buildReadinessSnapshot(
  date: string,
  week: WeekDoc,
  profile: AthleteProfile,
  archivedWeeks: WeekDoc[],
): ReadinessSnapshot {
  const readiness = week.daily_readiness?.[date] ?? null
  const garmin = week.garmin_recovery?.[date] ?? null

  const savedScore = week.daily_scores?.[date]
  const score = savedScore ?? (() => {
    const allSessions = [...archivedWeeks.flatMap((w) => w.sessions), ...week.sessions]
    const athlete = { rhr: profile.rhr_bpm, maxHr: 220 - profile.age }
    const loadPoints = allSessions
      .filter((s) => s.status === 'completed' && s.date <= date)
      .map((s) => sessionToLoadPoint(s, athlete))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    const acwr = calcACWR(loadPoints)
    return calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness)
  })()

  // 7-day average sleep from current week's Garmin recovery data
  const sleepValues = Object.values(week.garmin_recovery ?? {})
    .map((r) => r.sleep_hours)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const sleep_avg_7d = sleepValues.length > 0
    ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
    : null

  return { date, score, readiness, garmin, sleep_avg_7d, has_garmin_sleep: garmin?.sleep_hours != null }
}
