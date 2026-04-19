import type { WeekDoc } from './schema'
import { readArchivedWeeks, readAppState } from './data'

// Build the full export payload
// Returns: the current week doc augmented with a `history` block
// The history block is NOT part of WeekDoc schema — it's extra context for Claude
export interface ExportPayload {
  // Everything from WeekDoc
  week: string
  athlete: WeekDoc['athlete']
  sessions: WeekDoc['sessions']
  week_summary: WeekDoc['week_summary']
  lift_progression: WeekDoc['lift_progression']
  health_flags: WeekDoc['health_flags']
  next_week_plan: WeekDoc['next_week_plan']

  // Extra context for Claude
  is_deload_week: boolean     // whether the current week is flagged as a deload week
  photos_to_attach: string[]  // flat list of all photo paths from all sessions
  history: WeekHistory[]      // last 4 archived weeks (compact)
}

export interface WeekHistory {
  week: string               // week label
  total_sessions: number
  strength_days: number
  conditioning_days: number  // high_output_days
  total_calories: number
  peak_lifts: Record<string, number>  // lift key → peak value (numbers only from lift_progression)
}

export function buildExport(currentWeek: WeekDoc): ExportPayload {
  const state = readAppState()

  // 1. Collect all photo paths from sessions
  const photos_to_attach = currentWeek.sessions
    .flatMap(s => s.photos ?? [])
    .filter(Boolean)

  // 2. Load last 4 archived weeks for history
  const archivedWeeks = readArchivedWeeks(4)
  const history: WeekHistory[] = archivedWeeks.map(w => ({
    week: w.week,
    total_sessions: w.week_summary.total_sessions,
    strength_days: w.week_summary.strength_days,
    conditioning_days: w.week_summary.high_output_days,
    total_calories: w.week_summary.total_calories,
    // Only numeric values from lift_progression
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
