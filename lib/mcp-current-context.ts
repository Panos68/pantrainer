import type { AutomationNotes, ProposedPlan, Session, WeekDoc } from './schema'
import type { CoachContext } from './export'

function compactSession(session: Session) {
  return {
    date: session.date,
    day: session.day,
    type: session.type,
    subtype: session.subtype ?? null,
    status: session.status,
    duration_min: session.duration_min ?? null,
    rpe: session.rpe ?? null,
    reasoning: session.reasoning ?? null,
    exercises: session.exercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      weight_kg: exercise.weight_kg ?? null,
      notes: exercise.notes ?? null,
      effort: exercise.effort ?? null,
    })),
  }
}

export function buildCurrentContext(
  week: WeekDoc,
  coachContext: CoachContext,
  notes: AutomationNotes | null,
  proposed: ProposedPlan | null,
  today: string,
) {
  return {
    context_type: 'daily_compact',
    date: today,
    week: week.week,
    athlete: week.athlete,
    today_session: week.sessions.find((session) => session.date === today) ?? null,
    week_schedule: week.sessions.map(compactSession),
    week_summary: week.week_summary,
    health_flags: week.health_flags.filter((flag) => !flag.cleared),
    coach_context: coachContext,
    automation_notes: notes,
    proposed_plan: proposed
      ? {
          created_at: proposed.created_at,
          source: proposed.source,
          run_type: proposed.run_type,
          notes_version: proposed.notes_version,
          analysis_text: proposed.analysis_text,
          today_session: proposed.week_doc.sessions.find((session) => session.date === today) ?? null,
        }
      : null,
  }
}
