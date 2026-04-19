import { validateImport, applyImport } from '@/lib/import'

// POST /api/import
// Body: { json: string }  — the raw Claude response text
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

  const applied = applyImport(result.data)

  return Response.json({
    ...result,
    data: applied,
  })
}
