import { readWeekContainingDate } from '@/lib/data'
import { sanitizeRecovery } from '@/lib/garmin-recovery'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid date' }, { status: 400 })
  }

  const found = await readWeekContainingDate(date)
  if (!found) {
    return Response.json(
      { error: 'Session not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }

  const { week, isCurrent } = found
  const session = week.sessions.find((s) => s.date === date)
  if (!session) {
    return Response.json(
      { error: 'Session not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }

  const recoveryRaw = week.garmin_recovery?.[date] ?? null

  return Response.json({
    session,
    isCurrent,
    recovery: recoveryRaw ? sanitizeRecovery(recoveryRaw) : null,
  })
}
