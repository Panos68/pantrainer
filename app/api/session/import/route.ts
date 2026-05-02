import { NextRequest } from 'next/server'
import { SessionSchema } from '@/lib/schema'
import { readCurrentWeekDirect, writeCurrentWeek } from '@/lib/data'

// POST /api/session/import
// Body: { json: string } — raw JSON for a single session
// Updates the matching day in current week while preserving canonical day/date and current status
export async function POST(req: NextRequest) {
  let body: { json?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body'] }, { status: 400 })
  }

  if (!body.json) return Response.json({ ok: false, errors: ['Missing json field'] }, { status: 400 })

  let parsed: unknown
  try {
    parsed = JSON.parse(body.json)
  } catch {
    return Response.json({ ok: false, errors: ['Invalid JSON'] }, { status: 422 })
  }

  const result = SessionSchema.safeParse(parsed)
  if (!result.success) {
    return Response.json({
      ok: false,
      errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    }, { status: 422 })
  }

  const imported = result.data
  const week = await readCurrentWeekDirect()
  if (!week) return Response.json({ ok: false, errors: ['No active week'] }, { status: 400 })

  const idx = week.sessions.findIndex((s) => s.day === imported.day)
  if (idx === -1) return Response.json({ ok: false, errors: [`No session found for ${imported.day}`] }, { status: 404 })

  const existing = week.sessions[idx]
  const merged = {
    ...existing,
    ...imported,
    day: existing.day,
    date: existing.date,
    status: existing.status,
  }
  week.sessions[idx] = merged
  await writeCurrentWeek(week)

  return Response.json({ ok: true, session: merged })
}
