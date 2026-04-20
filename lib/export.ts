import type { WeekDoc } from './schema'
import { readArchivedWeeks, readAppState } from './data'

export interface ExportPayload {
  week: string
  athlete: WeekDoc['athlete']
  sessions: WeekDoc['sessions']
  week_summary: WeekDoc['week_summary']
  lift_progression: WeekDoc['lift_progression']
  health_flags: WeekDoc['health_flags']
  next_week_plan: WeekDoc['next_week_plan']
  is_deload_week: boolean
  photos_to_attach: string[]
  history: WeekHistory[]
}

export interface WeekHistory {
  week: string
  total_sessions: number
  strength_days: number
  conditioning_days: number
  total_calories: number
  peak_lifts: Record<string, number>
}

export async function buildExport(currentWeek: WeekDoc): Promise<ExportPayload> {
  const state = await readAppState()

  const photos_to_attach = currentWeek.sessions
    .flatMap((s) => s.photos ?? [])
    .filter(Boolean)

  const archivedWeeks = await readArchivedWeeks(4)
  const history: WeekHistory[] = archivedWeeks.map((w) => ({
    week: w.week,
    total_sessions: w.week_summary.total_sessions,
    strength_days: w.week_summary.strength_days,
    conditioning_days: w.week_summary.high_output_days,
    total_calories: w.week_summary.total_calories,
    peak_lifts: Object.fromEntries(
      Object.entries(w.lift_progression)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => [k, v as number])
    ),
  }))

  return {
    ...currentWeek,
    is_deload_week: state.isDeloadWeek,
    photos_to_attach,
    history,
  }
}
