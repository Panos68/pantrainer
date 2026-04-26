import { clearProposedPlan, readProposedPlan } from '@/lib/data'

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
    raw_json: proposed.raw_json,
  })
}

export async function DELETE() {
  await clearProposedPlan()
  return Response.json({ ok: true })
}
