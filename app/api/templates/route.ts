import { requireOwnerSession } from '@/lib/automation-auth'
import { readAllSessions, readAthleteProfile, readCurrentWeekDirect, readProposedPlan, writeProposedPlan } from '@/lib/data'
import { buildTemplateWeek, getTemplate, PLAN_TEMPLATES, templateWeekMonday } from '@/lib/plan-templates'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'
import { WeekDocSchema, type WeekDoc } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const EMPTY_ATHLETE: WeekDoc['athlete'] = {
  name: '', age: 0, weight_kg: 0, smm_kg: 0, bf_pct: 0, bmr_kcal: 0, rhr_bpm: 0, smm_target_kg: 0,
}

export async function GET(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied
  const pending = await readProposedPlan()
  return Response.json({
    templates: PLAN_TEMPLATES.map(({ id, name, summary, daysPerWeek, goal, week }) => ({
      id, name, summary, daysPerWeek, goal,
      days: Object.entries(week).map(([day, s]) => ({ day, type: s!.type, subtype: s!.subtype })),
    })),
    pendingProposal: pending ? { source: pending.source, created_at: pending.created_at } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST { templateId, week: 'current' | 'next', replace?: boolean }
// Turns a template into the pending proposal — reviewed and applied on the
// Plan page like any proposal from Claude. Never applies anything itself, and
// never silently replaces a proposal that's already waiting for review.
export async function POST(request: Request) {
  const denied = await requireOwnerSession(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as { templateId?: unknown; week?: unknown; replace?: unknown } | null
  const template = typeof body?.templateId === 'string' ? getTemplate(body.templateId) : undefined
  if (!template) return Response.json({ error: 'Unknown template' }, { status: 400 })
  const which = body?.week === 'current' ? 'current' : 'next'

  const pending = await readProposedPlan()
  if (pending && body?.replace !== true) {
    return Response.json(
      { error: 'A proposal is already waiting for review', pendingProposal: { source: pending.source, created_at: pending.created_at } },
      { status: 409 },
    )
  }

  const [history, profile, current] = await Promise.all([readAllSessions(), readAthleteProfile(), readCurrentWeekDirect()])
  const athlete = profile ?? current?.athlete ?? EMPTY_ATHLETE
  const monday = templateWeekMonday(todayIsoInAppTimeZone(), which)
  const weekDoc = WeekDocSchema.parse(buildTemplateWeek(template, monday, athlete, history))

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source: `template:${template.id}`,
    run_type: 'manual',
    notes_version: null,
    analysis_text: `${template.name} — ${template.summary}`,
    raw_json: JSON.stringify(weekDoc, null, 2),
    week_doc: weekDoc,
  })
  return Response.json({ ok: true, week: weekDoc.week })
}
