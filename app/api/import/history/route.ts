import { requireOwnerSession } from '@/lib/automation-auth'
import { demoForbidden } from '@/lib/demo-mode'
import { readAllSessions, readArchivedWeekById, readAthleteProfile, readCurrentWeekDirect, writeArchivedWeek } from '@/lib/data'
import { mergeImportedWeek, parseHistoryCsv, planImport, setsToSessions } from '@/lib/history-import'
import { WeekDocSchema, type WeekDoc } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const EMPTY_ATHLETE: WeekDoc['athlete'] = {
  name: '', age: 0, weight_kg: 0, smm_kg: 0, bf_pct: 0, bmr_kcal: 0, rhr_bpm: 0, smm_target_kg: 0,
}

// POST { csv, apply } — apply:false returns a preview; apply:true writes the
// imported weeks. Days that already have a session in the app are skipped, so
// re-importing the same file is a no-op.
export async function POST(request: Request) {
  const denied = (await requireOwnerSession(request)) ?? demoForbidden()
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as { csv?: unknown; apply?: unknown } | null
  if (!body || typeof body.csv !== 'string' || body.csv.length === 0) {
    return Response.json({ error: 'Missing CSV' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseHistoryCsv(body.csv)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not read the file' }, { status: 422 })
  }

  const [existing, profile, current] = await Promise.all([readAllSessions(), readAthleteProfile(), readCurrentWeekDirect()])
  const athlete = profile ?? current?.athlete ?? EMPTY_ATHLETE
  const plan = planImport(setsToSessions(parsed.sets, parsed.format), new Set(existing.map((s) => s.date)), athlete)

  const summary = {
    format: parsed.format,
    sessions: plan.importedSessions,
    weeks: plan.weeks.length,
    exercises: plan.exerciseCount,
    dateRange: plan.dateRange,
    skippedExistingDays: plan.skippedExistingDays,
    skippedRows: parsed.skippedRows,
  }
  if (body.apply !== true) return Response.json({ ...summary, applied: false })

  for (const { id, week } of plan.weeks) {
    const merged = mergeImportedWeek(await readArchivedWeekById(id), WeekDocSchema.parse(week))
    await writeArchivedWeek(id, merged)
  }
  return Response.json({ ...summary, applied: true })
}
