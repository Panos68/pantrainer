import { fetchAndStoreRenphoMeasurements } from '@/lib/renpho-measurements'

// Scheduled at 09:00 UTC (see vercel.json) = 10:00 Europe/Stockholm in winter,
// 11:00 in summer. Unlike finalize-day, this doesn't need to pin to the
// midnight boundary — it just needs to run comfortably after a morning
// weigh-in, on either side of the DST switch.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RENPHO_EMAIL || !process.env.RENPHO_PASSWORD) {
    return Response.json({ error: 'Renpho credentials not configured' }, { status: 503 })
  }

  try {
    const { updated } = await fetchAndStoreRenphoMeasurements()
    return Response.json({ ok: true, updated })
  } catch (err) {
    console.error('renpho-sync: failed to refresh measurements', err)
    return Response.json({ ok: false, error: 'Renpho fetch failed' }, { status: 500 })
  }
}
