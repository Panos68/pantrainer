import { format } from 'date-fns'
import { z } from 'zod'
import { isAutomationAuthorized, requireAutomationToken } from '@/lib/automation-auth'
import { readAutomationNotes, readCurrentWeek, writeProposedPlan } from '@/lib/data'
import { ProposedPlanRunTypeSchema, SessionSchema } from '@/lib/schema'

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const AutomationProposedTodayRequestSchema = z.object({
  json: z.string().optional(),
  session: SessionSchema.optional(),
  target_date: z.string().regex(ISO_DATE_REGEX).optional(),
  source: z.string().optional(),
  run_type: ProposedPlanRunTypeSchema.optional(),
  notes_version: z.string().nullable().optional(),
})

function parseSessionUpdate(body: z.infer<typeof AutomationProposedTodayRequestSchema>) {
  if (body.session) return { session: body.session }

  if (!body.json || body.json.trim().length === 0) {
    return { error: 'Missing session update (provide session or json)' as const }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body.json)
  } catch {
    return { error: 'Invalid JSON for session update' as const }
  }

  const result = SessionSchema.safeParse(parsed)
  if (!result.success) {
    return {
      error: 'Invalid session update',
      errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    }
  }

  return { session: result.data }
}

export async function POST(request: Request) {
  const tokenCheck = requireAutomationToken()
  if (!tokenCheck.ok) return tokenCheck.response

  if (!isAutomationAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsedBody = AutomationProposedTodayRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return Response.json(
      { error: 'Invalid request shape', issues: parsedBody.error.issues },
      { status: 422 },
    )
  }

  const parsedSession = parseSessionUpdate(parsedBody.data)
  if ('error' in parsedSession) {
    return Response.json(
      {
        error: parsedSession.error,
        errors: 'errors' in parsedSession ? parsedSession.errors ?? [] : [],
      },
      { status: 422 },
    )
  }

  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const targetDate = parsedBody.data.target_date ?? format(new Date(), 'yyyy-MM-dd')
  const targetIndex = currentWeek.sessions.findIndex((s) => s.date === targetDate)
  if (targetIndex === -1) {
    return Response.json({ error: `No session found for ${targetDate}` }, { status: 404 })
  }

  const existing = currentWeek.sessions[targetIndex]
  if (existing.status === 'completed' || existing.status === 'skipped') {
    return Response.json(
      { error: `${existing.day} is already finalized` },
      { status: 409 },
    )
  }

  const normalizedSession = {
    ...parsedSession.session,
    day: existing.day,
    date: existing.date,
    status: existing.status,
  }

  const proposedWeek = {
    ...currentWeek,
    sessions: currentWeek.sessions.map((session, index) =>
      index === targetIndex ? normalizedSession : session,
    ),
  }

  const notes = await readAutomationNotes()
  const proposed = {
    created_at: new Date().toISOString(),
    source: parsedBody.data.source ?? 'cowork',
    run_type: parsedBody.data.run_type ?? 'daily',
    notes_version: parsedBody.data.notes_version ?? notes.updated_at,
    raw_json: JSON.stringify(proposedWeek, null, 2),
    week_doc: proposedWeek,
  }

  await writeProposedPlan(proposed)

  return Response.json({
    ok: true,
    target_day: existing.day,
    target_date: existing.date,
    created_at: proposed.created_at,
    run_type: proposed.run_type,
  })
}
