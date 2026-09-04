import { readWeekContainingDate } from '@/lib/data'

// Read-only: returns whatever the nightly renpho-sync cron already stored.
// Deliberately never calls the Renpho API itself — Renpho invalidates
// concurrent sessions, so this must not trigger a login on every page view.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  const found = await readWeekContainingDate(date)
  const measurement = found?.week.renpho_measurements?.[date] ?? null
  return Response.json({ measurement }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
