import { z } from 'zod'
import { clearProposedPlan, readAutomationNotes, readProposedPlan, writeProposedPlan } from '@/lib/data'
import { ProposedPlanRunTypeSchema, WeekDocSchema } from '@/lib/schema'

export async function GET() {
  const proposed = await readProposedPlan()
  if (!proposed) {
    return Response.json({ empty: true })
  }

  return Response.json({
    empty: false,
    created_at: proposed.created_at,
    source: proposed.source,
    run_type: proposed.run_type,
    notes_version: proposed.notes_version,
    analysis_text: proposed.analysis_text,
    week_doc: proposed.week_doc,
    raw_json: proposed.raw_json,
  })
}

export async function DELETE() {
  await clearProposedPlan()
  return Response.json({ ok: true })
}

const ProposedPatchSchema = z.object({
  week_doc: WeekDocSchema,
  analysis_text: z.string().nullable().optional(),
  source: z.string().optional(),
  run_type: ProposedPlanRunTypeSchema.optional(),
})

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ProposedPatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request shape', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const notes = await readAutomationNotes()
  const proposed = {
    created_at: new Date().toISOString(),
    source: parsed.data.source ?? 'athlete-review',
    run_type: parsed.data.run_type ?? 'manual',
    notes_version: notes.updated_at,
    analysis_text: parsed.data.analysis_text ?? null,
    raw_json: JSON.stringify(parsed.data.week_doc, null, 2),
    week_doc: parsed.data.week_doc,
  }

  await writeProposedPlan(proposed)

  return Response.json({
    empty: false,
    created_at: proposed.created_at,
    source: proposed.source,
    run_type: proposed.run_type,
    notes_version: proposed.notes_version,
    analysis_text: proposed.analysis_text,
    week_doc: proposed.week_doc,
    raw_json: proposed.raw_json,
  })
}
