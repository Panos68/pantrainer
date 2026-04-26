import { validateImport, applyImport, isApplyImportError } from '@/lib/import'
import { readCurrentWeek } from '@/lib/data'

function weekStartIso(week: { sessions: Array<{ day: string; date: string }> }): string | null {
  const monday = week.sessions.find((s) => s.day === 'Monday')?.date
  return monday ?? null
}

// POST /api/import
// Body: { json: string }  — Claude response text:
//   - week_doc JSON, or
//   - { week_doc, analysis_text }
// Returns: ImportResult | ImportError
// On success: also calls applyImport
export async function POST(request: Request) {
  let body: { json?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, raw: '', errors: ['Invalid request body'] }, { status: 400 })
  }

  if (!body.json || typeof body.json !== 'string') {
    return Response.json({ ok: false, raw: '', errors: ['Missing or invalid "json" field'] }, { status: 400 })
  }

  const result = validateImport(body.json)

  if (!result.ok) {
    return Response.json(result, { status: 422 })
  }

  let applied
  try {
    applied = await applyImport(result.data)
  } catch (error) {
    if (isApplyImportError(error)) {
      return Response.json({ ok: false, raw: body.json, errors: error.errors }, { status: 422 })
    }
    return Response.json({ ok: false, raw: body.json, errors: ['Failed to apply imported plan'] }, { status: 500 })
  }

  return Response.json({
    ...result,
    data: applied,
    analysis_text: result.analysis_text,
    activation:
      weekStartIso((await readCurrentWeek()) ?? { sessions: [] }) === weekStartIso(applied)
        ? 'immediate'
        : 'scheduled',
  })
}
