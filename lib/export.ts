import type { WeekDoc } from './schema'
import { readArchivedWeeks, readAppState } from './data'
import { sessionToLoadPoint, type TrainingLoadPoint } from './training-load'
import { format, parseISO, subDays } from 'date-fns'

export interface ExportPayload {
  week: string
  athlete: WeekDoc['athlete']
  sessions: WeekDoc['sessions']
  week_summary: WeekDoc['week_summary']
  lift_progression: WeekDoc['lift_progression']
  health_flags: WeekDoc['health_flags']
  next_week_plan: WeekDoc['next_week_plan']
  is_deload_week: boolean
  photos_to_attach: string[]
  history: WeekHistory[]
  training_load_history: TrainingLoadPoint[]
}

export interface CoachContext {
  adherence: {
    completed: number
    planned_total: number
    skipped: number
    adherence_pct: number
    by_type: Record<string, { completed: number; planned: number; adherence_pct: number }>
  }
  load_summary: {
    acute_load_7d: number
    chronic_load_28d: number | null
    acwr: number | null
    monotony_7d: number | null
    strain_7d: number | null
  }
  recovery_summary: {
    sleep_avg_7d: number | null
    sleep_avg_prev_7d: number | null
    sleep_trend_hours: number | null
    resting_hr_avg_7d: number | null
    resting_hr_delta_vs_baseline: number | null
  }
  lift_summary: {
    current_lifts: Record<string, number>
    pr_lifts: string[]
    plateau_lifts: string[]
  }
  constraints: {
    active_flags: WeekDoc['health_flags']
    planning_rules: string[]
  }
  data_quality: {
    completed_sessions: number
    sessions_with_hr: number
    sessions_with_duration: number
    sessions_with_calories: number
    recovery_days_logged: number
    confidence_score: number
  }
}

export interface ExportPayloadV2 extends ExportPayload {
  export_version: 'v2'
  coach_context: CoachContext
}

export interface WeekHistory {
  week: string
  total_sessions: number
  strength_days: number
  conditioning_days: number
  total_calories: number
  peak_lifts: Record<string, number>
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function numericLifts(week: WeekDoc): Record<string, number> {
  return Object.fromEntries(
    Object.entries(week.lift_progression)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => [k, v as number]),
  )
}

function buildCoachContext(
  currentWeek: WeekDoc,
  archivedWeeks: WeekDoc[],
  training_load_history: TrainingLoadPoint[],
): CoachContext {
  const planned_total = currentWeek.sessions.length
  const completedSessions = currentWeek.sessions.filter((s) => s.status === 'completed')
  const skipped = currentWeek.sessions.filter((s) => s.status === 'skipped').length
  const completed = completedSessions.length

  const sessionTypes = [...new Set(currentWeek.sessions.map((s) => s.type))]
  const by_type = Object.fromEntries(
    sessionTypes.map((type) => {
      const plannedByType = currentWeek.sessions.filter((s) => s.type === type).length
      const completedByType = currentWeek.sessions.filter(
        (s) => s.type === type && s.status === 'completed',
      ).length
      const adherence = plannedByType > 0 ? round1((completedByType / plannedByType) * 100) : 0
      return [type, { completed: completedByType, planned: plannedByType, adherence_pct: adherence }]
    }),
  )

  const latestLoadDate =
    training_load_history.length > 0
      ? training_load_history[training_load_history.length - 1].date
      : format(new Date(), 'yyyy-MM-dd')
  const acuteStart = format(subDays(parseISO(latestLoadDate), 6), 'yyyy-MM-dd')
  const chronicStart = format(subDays(parseISO(latestLoadDate), 27), 'yyyy-MM-dd')

  const acutePoints = training_load_history.filter((p) => p.date >= acuteStart && p.date <= latestLoadDate)
  const chronicPoints = training_load_history.filter((p) => p.date >= chronicStart && p.date <= latestLoadDate)
  const acute_load_7d = acutePoints.reduce((sum, p) => sum + p.training_load, 0)
  const chronicTotal = chronicPoints.reduce((sum, p) => sum + p.training_load, 0)
  const chronic_load_28d = chronicPoints.length > 0 ? round1(chronicTotal / 4) : null
  const acwr =
    chronic_load_28d && chronic_load_28d > 0 ? round1(acute_load_7d / chronic_load_28d) : null

  const dailyLoadMap = new Map<string, number>()
  for (const p of acutePoints) {
    dailyLoadMap.set(p.date, (dailyLoadMap.get(p.date) ?? 0) + p.training_load)
  }
  const acuteDailyLoads = Array.from({ length: 7 }, (_, i) =>
    dailyLoadMap.get(format(subDays(parseISO(latestLoadDate), i), 'yyyy-MM-dd')) ?? 0,
  )
  const meanLoad = acuteDailyLoads.reduce((a, b) => a + b, 0) / acuteDailyLoads.length
  const variance =
    acuteDailyLoads.reduce((sum, value) => sum + (value - meanLoad) ** 2, 0) / acuteDailyLoads.length
  const stdDev = Math.sqrt(variance)
  const monotony_7d = stdDev > 0 ? round1(meanLoad / stdDev) : null
  const strain_7d = monotony_7d != null ? Math.round(acute_load_7d * monotony_7d) : null

  const allRecovery = [...archivedWeeks, currentWeek]
    .flatMap((w) =>
      Object.entries(w.garmin_recovery ?? {}).map(([date, r]) => ({
        date,
        sleep: r.sleep_hours ?? null,
        resting_hr: r.resting_hr_bpm ?? null,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  const recoveryLatestDate =
    allRecovery.length > 0 ? allRecovery[allRecovery.length - 1].date : format(new Date(), 'yyyy-MM-dd')
  const recoveryStart7 = format(subDays(parseISO(recoveryLatestDate), 6), 'yyyy-MM-dd')
  const recoveryStartPrev7 = format(subDays(parseISO(recoveryLatestDate), 13), 'yyyy-MM-dd')
  const recoveryEndPrev7 = format(subDays(parseISO(recoveryLatestDate), 7), 'yyyy-MM-dd')

  const recentRecovery = allRecovery.filter((r) => r.date >= recoveryStart7 && r.date <= recoveryLatestDate)
  const prevRecovery = allRecovery.filter((r) => r.date >= recoveryStartPrev7 && r.date <= recoveryEndPrev7)

  const recentSleep = recentRecovery.map((r) => r.sleep).filter((v): v is number => v != null)
  const prevSleep = prevRecovery.map((r) => r.sleep).filter((v): v is number => v != null)
  const recentRhr = recentRecovery.map((r) => r.resting_hr).filter((v): v is number => v != null)

  const sleep_avg_7d = recentSleep.length > 0 ? round1(recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length) : null
  const sleep_avg_prev_7d = prevSleep.length > 0 ? round1(prevSleep.reduce((a, b) => a + b, 0) / prevSleep.length) : null
  const sleep_trend_hours =
    sleep_avg_7d != null && sleep_avg_prev_7d != null ? round1(sleep_avg_7d - sleep_avg_prev_7d) : null
  const resting_hr_avg_7d = recentRhr.length > 0 ? round1(recentRhr.reduce((a, b) => a + b, 0) / recentRhr.length) : null
  const resting_hr_delta_vs_baseline =
    resting_hr_avg_7d != null ? round1(resting_hr_avg_7d - currentWeek.athlete.rhr_bpm) : null

  const currentLifts = numericLifts(currentWeek)
  const priorLiftValuesByKey = new Map<string, number[]>()
  for (const week of archivedWeeks) {
    for (const [key, value] of Object.entries(numericLifts(week))) {
      priorLiftValuesByKey.set(key, [...(priorLiftValuesByKey.get(key) ?? []), value])
    }
  }
  const pr_lifts = Object.entries(currentLifts)
    .filter(([key, value]) => {
      const priors = priorLiftValuesByKey.get(key) ?? []
      return priors.length > 0 && value > Math.max(...priors)
    })
    .map(([key]) => key)

  const allWeeks = [...archivedWeeks, currentWeek]
  const plateau_lifts = Object.keys(currentLifts).filter((key) => {
    const series = allWeeks
      .map((w) => {
        const val = w.lift_progression[key]
        return typeof val === 'number' ? val : null
      })
      .filter((v): v is number => v != null)
    if (series.length < 4) return false
    const recent = series.slice(-4)
    return recent[3] <= Math.max(recent[0], recent[1], recent[2])
  })

  const active_flags = currentWeek.health_flags.filter((f) => !f.cleared)
  const planning_rules = active_flags.map((f) => {
    if (f.training_impact) return `${f.flag}: ${f.training_impact}`
    if (f.action) return `${f.flag}: ${f.action}`
    return `${f.flag}: monitor closely this week`
  })

  const sessions_with_hr = completedSessions.filter((s) => s.avg_hr_bpm != null).length
  const sessions_with_duration = completedSessions.filter((s) => s.duration_min != null).length
  const sessions_with_calories = completedSessions.filter((s) => s.total_calories != null).length
  const uniqueRecoveryDates = new Set(allRecovery.map((r) => r.date)).size
  const denominator = Math.max(completed, 1)
  const confidenceComponents = [
    sessions_with_hr / denominator,
    sessions_with_duration / denominator,
    sessions_with_calories / denominator,
    Math.min(uniqueRecoveryDates / 7, 1),
  ]
  const confidence_score = Math.round(
    (confidenceComponents.reduce((sum, value) => sum + value, 0) / confidenceComponents.length) * 100,
  )

  return {
    adherence: {
      completed,
      planned_total,
      skipped,
      adherence_pct: planned_total > 0 ? round1((completed / planned_total) * 100) : 0,
      by_type,
    },
    load_summary: {
      acute_load_7d,
      chronic_load_28d,
      acwr,
      monotony_7d,
      strain_7d,
    },
    recovery_summary: {
      sleep_avg_7d,
      sleep_avg_prev_7d,
      sleep_trend_hours,
      resting_hr_avg_7d,
      resting_hr_delta_vs_baseline,
    },
    lift_summary: {
      current_lifts: currentLifts,
      pr_lifts,
      plateau_lifts,
    },
    constraints: {
      active_flags,
      planning_rules,
    },
    data_quality: {
      completed_sessions: completed,
      sessions_with_hr,
      sessions_with_duration,
      sessions_with_calories,
      recovery_days_logged: uniqueRecoveryDates,
      confidence_score,
    },
  }
}

export async function buildExport(currentWeek: WeekDoc, options?: { includeDeload?: boolean }): Promise<ExportPayload> {
  const state = await readAppState()

  const photos_to_attach = currentWeek.sessions
    .flatMap((s) => s.photos ?? [])
    .filter(Boolean)

  const archivedWeeks = await readArchivedWeeks(4)
  const history: WeekHistory[] = archivedWeeks.map((w) => ({
    week: w.week,
    total_sessions: w.week_summary.total_sessions,
    strength_days: w.week_summary.strength_days,
    conditioning_days: w.week_summary.high_output_days,
    total_calories: w.week_summary.total_calories,
    peak_lifts: Object.fromEntries(
      Object.entries(w.lift_progression)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => [k, v as number])
    ),
  }))

  const training_load_history: TrainingLoadPoint[] = [...archivedWeeks, currentWeek]
    .flatMap((w) => w.sessions)
    .map(sessionToLoadPoint)
    .filter((p): p is TrainingLoadPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    ...currentWeek,
    is_deload_week: options?.includeDeload ?? state.isDeloadWeek,
    photos_to_attach,
    history,
    training_load_history,
  }
}

export async function buildExportV2(
  currentWeek: WeekDoc,
  options?: { includeDeload?: boolean },
): Promise<ExportPayloadV2> {
  const base = await buildExport(currentWeek, options)
  const archivedWeeks = await readArchivedWeeks(8)

  return {
    ...base,
    export_version: 'v2',
    coach_context: buildCoachContext(currentWeek, archivedWeeks, base.training_load_history),
  }
}
