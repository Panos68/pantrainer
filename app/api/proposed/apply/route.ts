import { applyImport, isApplyImportError } from '@/lib/import'
import { readProposedPlan } from '@/lib/data'

export async function POST() {
  const proposed = await readProposedPlan()
  if (!proposed) {
    return Response.json({ error: 'No proposed plan found' }, { status: 404 })
  }

  try {
    const applied = await applyImport(proposed.week_doc)
    return Response.json({ ok: true, data: applied })
  } catch (error) {
    if (isApplyImportError(error)) {
      return Response.json({ ok: false, errors: error.errors }, { status: 422 })
    }
    return Response.json({ ok: false, errors: ['Failed to apply proposed plan'] }, { status: 500 })
  }
}
