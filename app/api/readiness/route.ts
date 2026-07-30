import { NextRequest, NextResponse } from 'next/server'
import { readCurrentWeek, readCurrentWeekDirect, readAthleteProfile, readArchivedWeeks, writeCurrentWeek } from '@/lib/data'
import { DailyReadinessSchema } from '@/lib/schema'
import { computeDailyScore } from '@/lib/daily-score'
import { buildReadinessSnapshot } from '@/lib/readiness'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayIsoInAppTimeZone()

  const [week, profile, archivedWeeks] = await Promise.all([
    readCurrentWeek(),
    readAthleteProfile(),
    readArchivedWeeks(8),
  ])

  if (!week || !profile) {
    return NextResponse.json(
      { error: 'No active week or profile' },
      { status: 404, headers: NO_STORE_HEADERS },
    )
  }

  return NextResponse.json(
    buildReadinessSnapshot(date, week, profile, archivedWeeks),
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
