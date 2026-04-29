import { NextRequest, NextResponse } from 'next/server'
import { readCurrentWeek, readDailyReadiness, writeDailyReadiness, readAthleteProfile, readArchivedWeeks } from '@/lib/data'
import { DailyReadinessSchema } from '@/lib/schema'
import { calcRecoveryScore } from '@/lib/recovery-score'
import { sessionToLoadPoint } from '@/lib/training-load'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

function calcACWR(loadPoints: NonNullable<ReturnType<typeof sessionToLoadPoint>>[]): number | null {
  if (loadPoints.length < 3) return null
  const sorted = [...loadPoints].sort((a, b) => a.date.localeCompare(b.date))
  const oldest = parseISO(sorted[0].date)
  const latest = parseISO(sorted[sorted.length - 1].date)
  // Need at least 14 days of history for ACWR to be meaningful
  if (differenceInDays(latest, oldest) < 14) return null
  const latestStr = format(latest, 'yyyy-MM-dd')
  const acuteStart = format(subDays(latest, 6), 'yyyy-MM-dd')
  const chronicStart = format(subDays(latest, 27), 'yyyy-MM-dd')
  const acute = sorted.filter((p) => p.date >= acuteStart).reduce((s, p) => s + p.training_load, 0)
  const chronicPoints = sorted.filter((p) => p.date >= chronicStart && p.date <= latestStr)
  const chronic = chronicPoints.length > 0 ? chronicPoints.reduce((s, p) => s + p.training_load, 0) / 4 : null
  if (!chronic || chronic === 0) return null
  return Math.round((acute / chronic) * 100) / 100
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd')

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

  // Build load history from archived weeks + current week for accurate ACWR
  const allSessions = [
    ...archivedWeeks.flatMap((w) => w.sessions),
    ...week.sessions,
  ]
  const athlete = { rhr: profile.rhr_bpm, maxHr: 220 - profile.age }
  const loadPoints = allSessions
    .filter((s) => s.status === 'completed' && s.date <= date)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const acwr = calcACWR(loadPoints)
  const score = calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness)

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

  await writeDailyReadiness(parsed.data)
  return NextResponse.json({ ok: true, readiness: parsed.data }, { headers: NO_STORE_HEADERS })
}
