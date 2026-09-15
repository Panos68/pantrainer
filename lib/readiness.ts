import type { WeekDoc, AthleteProfile, GarminRecoveryDay, DailyReadiness, RecoveryScoreBreakdown } from './schema'
import { calcRecoveryScore } from './recovery-score'
import { calcACWR } from './daily-score'
import { calcBaselines } from './baselines'
import { sessionToLoadPoint } from './training-load'
import { subDays, format, parseISO } from 'date-fns'

export interface ReadinessBaseline {
  total: number | null
  sleep: number | null
  rhr: number | null
  load: number | null
  subjective: number | null
}

export interface ReadinessSnapshot {
  date: string
  score: RecoveryScoreBreakdown
  readiness: DailyReadiness | null
  garmin: GarminRecoveryDay | null
  sleep_avg_7d: number | null
  has_garmin_sleep: boolean
  baseline: ReadinessBaseline
}

// Average of the trailing 7 days' saved scores (excluding `date` itself),
// so today's drivers can be shown as a delta against recent normal rather
// than just an absolute bar.
function calc7dBaseline(date: string, week: WeekDoc, archivedWeeks: WeekDoc[]): ReadinessBaseline {
  const allScores: Record<string, RecoveryScoreBreakdown> = {
    ...Object.assign({}, ...archivedWeeks.map((w) => w.daily_scores ?? {})),
    ...(week.daily_scores ?? {}),
  }

  const priorDays = Array.from({ length: 7 }, (_, i) => format(subDays(parseISO(date), i + 1), 'yyyy-MM-dd'))
  const priorScores = priorDays.map((d) => allScores[d]).filter((s): s is RecoveryScoreBreakdown => s != null)

  if (priorScores.length === 0) {
    return { total: null, sleep: null, rhr: null, load: null, subjective: null }
  }

  const avg = (pick: (s: RecoveryScoreBreakdown) => number) =>
    Math.round(priorScores.reduce((sum, s) => sum + pick(s), 0) / priorScores.length)

  return {
    total: avg((s) => s.total),
    sleep: avg((s) => s.sleep),
    rhr: avg((s) => s.rhr),
    load: avg((s) => s.load),
    subjective: avg((s) => s.subjective),
  }
}

export function buildReadinessSnapshot(
  date: string,
  week: WeekDoc,
  profile: AthleteProfile,
  archivedWeeks: WeekDoc[],
): ReadinessSnapshot {
  const readiness = week.daily_readiness?.[date] ?? null
  const garmin = week.garmin_recovery?.[date] ?? null
  const baselines = calcBaselines(date, [...archivedWeeks, week])

  const savedScore = week.daily_scores?.[date]
  const score = savedScore ?? (() => {
    const allSessions = [...archivedWeeks.flatMap((w) => w.sessions), ...week.sessions]
    const athlete = { rhr: profile.rhr_bpm, maxHr: 220 - profile.age }
    const loadPoints = allSessions
      .filter((s) => s.status === 'completed' && s.date <= date)
      .map((s) => sessionToLoadPoint(s, athlete))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    const acwr = calcACWR(loadPoints, date)
    return calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness, baselines)
  })()

  // Real trailing 7 days including `date` itself (i = 0..6 days back), pulled
  // from current + archived weeks — the old version averaged every entry ever stored in the
  // current week's garmin_recovery map, which drifted wildly in size and
  // ignored week rollovers entirely.
  const allRecovery: Record<string, GarminRecoveryDay> = {
    ...Object.assign({}, ...archivedWeeks.map((w) => w.garmin_recovery ?? {})),
    ...(week.garmin_recovery ?? {}),
  }
  const priorSleepDays = Array.from({ length: 7 }, (_, i) => format(subDays(parseISO(date), i), 'yyyy-MM-dd'))
  const sleepValues = priorSleepDays
    .map((d) => allRecovery[d]?.sleep_hours)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const sleep_avg_7d = sleepValues.length > 0
    ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
    : null

  const baseline = calc7dBaseline(date, week, archivedWeeks)

  return { date, score, readiness, garmin, sleep_avg_7d, has_garmin_sleep: garmin?.sleep_hours != null, baseline }
}
