import { applyImport, isApplyImportError } from '@/lib/import'
import { readCurrentWeek, readProposedPlan } from '@/lib/data'

function weekStartIso(week: { sessions: Array<{ day: string; date: string }> }): string | null {
  const monday = week.sessions.find((s) => s.day === 'Monday')?.date
  return monday ?? null
}

export async function POST() {
  const proposed = await readProposedPlan()
  if (!proposed) {
    return Response.json({ error: 'No proposed plan found' }, { status: 404 })
  }

  try {
    const applied = await applyImport(proposed.week_doc)
    const current = await readCurrentWeek()
    const activation =
      weekStartIso(current ?? { sessions: [] }) === weekStartIso(applied)
        ? 'immediate'
        : 'scheduled'
    return Response.json({ ok: true, data: applied, activation })
  } catch (error) {
    if (isApplyImportError(error)) {
      return Response.json({ ok: false, errors: error.errors }, { status: 422 })
    }
    return Response.json({ ok: false, errors: ['Failed to apply proposed plan'] }, { status: 500 })
  }
}
