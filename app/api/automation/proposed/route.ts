import { z } from 'zod'
import { readAutomationNotes, writeProposedPlan } from '@/lib/data'
import { validateImport } from '@/lib/import'
import { ProposedPlanRunTypeSchema, WeekDocSchema } from '@/lib/schema'
import { isAutomationAuthorized, requireAutomationToken } from '@/lib/automation-auth'
import type { WeekDoc } from '@/lib/schema'

const AutomationProposedRequestSchema = z.object({
  json: z.string().optional(),
  week_doc: WeekDocSchema.optional(),
  analysis_text: z.string().nullable().optional(),
  source: z.string().optional(),
  run_type: ProposedPlanRunTypeSchema.optional(),
  notes_version: z.string().nullable().optional(),
})

function parseWeekDoc(body: z.infer<typeof AutomationProposedRequestSchema>): {
  weekDoc: WeekDoc
  rawJson: string
  analysisText: string | null
} | {
  error: string
  errors?: string[]
} {
  if (body.json && body.json.trim().length > 0) {
    const result = validateImport(body.json)
    if (!result.ok) {
      return { error: 'Invalid proposed JSON', errors: result.errors }
    }
    return {
      weekDoc: result.data,
      rawJson: body.json,
      analysisText: body.analysis_text ?? result.analysis_text,
    }
  }

  if (body.week_doc) {
    return {
      weekDoc: body.week_doc,
      rawJson: JSON.stringify(body.week_doc, null, 2),
      analysisText: body.analysis_text ?? null,
    }
  }

  return { error: 'Missing json or week_doc in request body' }
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

  const parsedBody = AutomationProposedRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return Response.json(
      { error: 'Invalid request shape', issues: parsedBody.error.issues },
      { status: 422 },
    )
  }

  const parsedWeek = parseWeekDoc(parsedBody.data)
  if ('error' in parsedWeek) {
    return Response.json(
      { error: parsedWeek.error, errors: parsedWeek.errors ?? [] },
      { status: 422 },
    )
  }

  const notes = await readAutomationNotes()
  const proposed = {
    created_at: new Date().toISOString(),
    source: parsedBody.data.source ?? 'cowork',
    run_type: parsedBody.data.run_type ?? 'daily',
    notes_version: parsedBody.data.notes_version ?? notes.updated_at,
    analysis_text: parsedWeek.analysisText,
    raw_json: parsedWeek.rawJson,
    week_doc: parsedWeek.weekDoc,
  }

  await writeProposedPlan(proposed)

  return Response.json({
    ok: true,
    created_at: proposed.created_at,
    source: proposed.source,
    run_type: proposed.run_type,
    notes_version: proposed.notes_version,
    analysis_text: proposed.analysis_text,
  })
}
