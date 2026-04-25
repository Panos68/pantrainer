import { NextRequest, NextResponse } from 'next/server'
import { readCurrentWeek, readDailyReadiness, writeDailyReadiness, readAthleteProfile } from '@/lib/data'
import { DailyReadinessSchema } from '@/lib/schema'
import { calcRecoveryScore } from '@/lib/recovery-score'
import { sessionToLoadPoint } from '@/lib/training-load'
import { format, subDays, parseISO } from 'date-fns'

function calcACWR(loadPoints: NonNullable<ReturnType<typeof sessionToLoadPoint>>[]): number | null {
  if (loadPoints.length === 0) return null
  const sorted = [...loadPoints].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1].date
  const acuteStart = format(subDays(parseISO(latest), 6), 'yyyy-MM-dd')
  const chronicStart = format(subDays(parseISO(latest), 27), 'yyyy-MM-dd')
  const acute = sorted.filter((p) => p.date >= acuteStart).reduce((s, p) => s + p.training_load, 0)
  const chronicPoints = sorted.filter((p) => p.date >= chronicStart)
  const chronic = chronicPoints.length > 0 ? chronicPoints.reduce((s, p) => s + p.training_load, 0) / 4 : null
  if (!chronic || chronic === 0) return null
  return Math.round((acute / chronic) * 100) / 100
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd')

  const [week, profile, readiness] = await Promise.all([
    readCurrentWeek(),
    readAthleteProfile(),
    readDailyReadiness(date),
  ])

  if (!week || !profile) {
    return NextResponse.json({ error: 'No active week or profile' }, { status: 404 })
  }

  const garmin = week.garmin_recovery?.[date] ?? null

  const loadPoints = week.sessions
    .filter((s) => s.status === 'completed' && s.date <= date)
    .map(sessionToLoadPoint)
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const acwr = calcACWR(loadPoints)
  const score = calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness)

  return NextResponse.json({ date, score, readiness, garmin })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = DailyReadinessSchema.safeParse({
    ...body,
    logged_at: new Date().toISOString(),
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await writeDailyReadiness(parsed.data)
  return NextResponse.json({ ok: true })
}
