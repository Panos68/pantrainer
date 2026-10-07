import type { Session } from './schema'
import { computeRecords, e1rmSeries, liftSetsFromSessions, trackedLifts, type E1rmPoint, type LiftRecords, type TrackedLift } from './strength'
import { suggestionsFromSessions, type ProgressionSuggestion } from './progression-engine'
import { structuralBalance, type BalanceResult } from './structural-balance'

// One serialisable snapshot of the strength analytics, shared by the progress
// page, the log/live pages (via /api/strength) and the MCP server, so the app
// and Claude always see the same numbers.
export interface StrengthSummary {
  lifts: TrackedLift[]
  records: Record<string, LiftRecords>
  suggestions: Record<string, ProgressionSuggestion>
  balance: BalanceResult[]
  e1rmHistory: Record<string, E1rmPoint[]>
}

export function buildStrengthSummary(sessions: Session[], options: { includeHistory?: boolean } = {}): StrengthSummary {
  const sets = liftSetsFromSessions(sessions)
  const records = computeRecords(sets)
  const lifts = trackedLifts(sets)
  return {
    lifts,
    records: Object.fromEntries(records),
    suggestions: Object.fromEntries(suggestionsFromSessions(sessions)),
    balance: structuralBalance(records),
    e1rmHistory: options.includeHistory
      ? Object.fromEntries(lifts.map((l) => [l.key, e1rmSeries(sets, l.key)]))
      : {},
  }
}
