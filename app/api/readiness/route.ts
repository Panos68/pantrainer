import { NextRequest, NextResponse } from 'next/server'
import { readCurrentWeek, readCurrentWeekDirect, readDailyReadiness, readAthleteProfile, readArchivedWeeks, writeCurrentWeek } from '@/lib/data'
import { DailyReadinessSchema } from '@/lib/schema'
import { calcRecoveryScore } from '@/lib/recovery-score'
import { computeDailyScore, calcACWR } from '@/lib/daily-score'
import { sessionToLoadPoint } from '@/lib/training-load'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayIsoInAppTimeZone()

  const [week, profile, readiness, archivedWeeks] = await Promise.all([
    readCurrentWeek(),
    readAthleteProfile(),
    readDailyReadiness(date),
    readArchivedWeeks(8),
  ])

  if (!week || !profile) {
    return NextResponse.json(
      { error: 'No active week or profile' },
      { status: 404, headers: NO_STORE_HEADERS },
    )
  }

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

  return NextResponse.json(
    { date, score, readiness, garmin, sleep_avg_7d, has_garmin_sleep: garmin?.sleep_hours != null },
    { headers: NO_STORE_HEADERS },
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = DailyReadinessSchema.safeParse({
    ...body,
    logged_at: new Date().toISOString(),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const week = await readCurrentWeekDirect()
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  week.daily_readiness = { ...week.daily_readiness, [parsed.data.date]: parsed.data }

  try {
    const archivedWeeks = await readArchivedWeeks(8)
    const score = computeDailyScore(parsed.data.date, week, archivedWeeks)
    week.daily_scores = { ...week.daily_scores, [parsed.data.date]: score }
  } catch {
    // score persistence is best-effort — don't block saving readiness
  }

  await writeCurrentWeek(week)

  return NextResponse.json(
    { ok: true, readiness: parsed.data },
    { headers: NO_STORE_HEADERS },
  )
}
