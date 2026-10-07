import type { Exercise, Session } from './schema'
import { isProgressExcluded, nameToKey } from './progression'

// Set-level strength analytics: estimated 1RM, personal records and history.
// Lifts are identified by the same equipment-aware key as the progression
// charts (nameToKey), so a dumbbell press never sets a barbell PR.

export interface LiftSet {
  date: string
  key: string
  name: string
  weight: number
  reps: number
  excluded: boolean
}

// Epley estimate. Above ~12 reps the estimate stops meaning much, so those sets
// don't produce one (they still count for rep records).
export const MAX_E1RM_REPS = 12

export function e1rm(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps > 0) || reps > MAX_E1RM_REPS) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

function setsFromExercise(ex: Exercise): Array<{ weight: number; reps: number }> {
  const log = ex.set_log ?? []
  if (log.length > 0) {
    return log
      .filter((s) => s.weight_kg != null && s.weight_kg > 0 && s.reps > 0)
      .map((s) => ({ weight: s.weight_kg as number, reps: s.reps }))
  }
  // Older entries without a set log: fall back to the aggregate actuals.
  const weight = ex.actual_weight_kg
  const reps = typeof ex.actual_reps === 'number' ? ex.actual_reps : Number(ex.actual_reps)
  const sets = ex.actual_sets ?? 1
  if (weight == null || !(weight > 0) || !Number.isFinite(reps) || reps <= 0) return []
  return Array.from({ length: Math.max(1, sets) }, () => ({ weight, reps }))
}

export function liftSetsFromSessions(sessions: Session[]): LiftSet[] {
  const out: LiftSet[] = []
  for (const session of sessions) {
    if (session.status !== 'completed' || session.type !== 'Strength') continue
    const sessionExcluded = isProgressExcluded(session)
    for (const ex of session.exercises) {
      const key = nameToKey(ex.name)
      const excluded = sessionExcluded || isProgressExcluded(ex)
      for (const s of setsFromExercise(ex)) {
        out.push({ date: session.date, key, name: ex.name, weight: s.weight, reps: s.reps, excluded })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export interface LiftRecords {
  bestWeight: number
  bestE1rm: number | null
  // Most reps ever done at (at least) each weight.
  repsAtWeight: Record<string, number>
}

export function computeRecords(sets: LiftSet[]): Map<string, LiftRecords> {
  const records = new Map<string, LiftRecords>()
  for (const s of sets) {
    if (s.excluded) continue
    const r = records.get(s.key) ?? { bestWeight: 0, bestE1rm: null, repsAtWeight: {} }
    r.bestWeight = Math.max(r.bestWeight, s.weight)
    const est = e1rm(s.weight, s.reps)
    if (est != null && (r.bestE1rm == null || est > r.bestE1rm)) r.bestE1rm = est
    const w = String(s.weight)
    r.repsAtWeight[w] = Math.max(r.repsAtWeight[w] ?? 0, s.reps)
    records.set(s.key, r)
  }
  return records
}

export type PrKind = 'weight' | 'e1rm' | 'reps'

// Which records a new set would break. Rep PRs compare against every weight at
// or above this one (5 reps at 60 isn't a PR if you've done 6 at 62.5).
export function detectPrs(set: { weight: number; reps: number }, records: LiftRecords | undefined): PrKind[] {
  if (!records) return []
  if (!(set.weight > 0) || !(set.reps > 0)) return []
  const kinds: PrKind[] = []
  if (set.weight > records.bestWeight) kinds.push('weight')
  const est = e1rm(set.weight, set.reps)
  if (est != null && records.bestE1rm != null && est > records.bestE1rm) kinds.push('e1rm')
  const bestRepsAtOrAbove = Object.entries(records.repsAtWeight)
    .filter(([w]) => Number(w) >= set.weight)
    .reduce((max, [, reps]) => Math.max(max, reps), 0)
  if (set.weight <= records.bestWeight && set.reps > bestRepsAtOrAbove) kinds.push('reps')
  return kinds
}

export interface E1rmPoint {
  date: string
  e1rm: number
  weight: number
  reps: number
}

// Best estimated 1RM per training day for one lift (counted sets only).
export function e1rmSeries(sets: LiftSet[], key: string): E1rmPoint[] {
  const byDate = new Map<string, E1rmPoint>()
  for (const s of sets) {
    if (s.key !== key || s.excluded) continue
    const est = e1rm(s.weight, s.reps)
    if (est == null) continue
    const prev = byDate.get(s.date)
    if (!prev || est > prev.e1rm) byDate.set(s.date, { date: s.date, e1rm: est, weight: s.weight, reps: s.reps })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface TrackedLift {
  key: string
  name: string
  sessions: number
  bestE1rm: number | null
}

// Lifts with enough history to chart, most-trained first. The display name is
// the most recent spelling used.
export function trackedLifts(sets: LiftSet[], minSessions = 2): TrackedLift[] {
  const byKey = new Map<string, { name: string; dates: Set<string>; best: number | null }>()
  for (const s of sets) {
    if (s.excluded) continue
    const entry = byKey.get(s.key) ?? { name: s.name, dates: new Set<string>(), best: null }
    entry.name = s.name
    entry.dates.add(s.date)
    const est = e1rm(s.weight, s.reps)
    if (est != null && (entry.best == null || est > entry.best)) entry.best = est
    byKey.set(s.key, entry)
  }
  return [...byKey.entries()]
    .map(([key, e]) => ({ key, name: e.name, sessions: e.dates.size, bestE1rm: e.best }))
    .filter((l) => l.sessions >= minSessions && l.bestE1rm != null)
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
}

// Fold a just-logged set into a lift's records so the next set in the same
// session is compared against it (two PRs in a row both get celebrated, a
// repeat of the new best doesn't).
export function applySetToRecords(records: LiftRecords | undefined, set: { weight: number; reps: number }): LiftRecords {
  const r: LiftRecords = records
    ? { bestWeight: records.bestWeight, bestE1rm: records.bestE1rm, repsAtWeight: { ...records.repsAtWeight } }
    : { bestWeight: 0, bestE1rm: null, repsAtWeight: {} }
  if (!(set.weight > 0) || !(set.reps > 0)) return r
  r.bestWeight = Math.max(r.bestWeight, set.weight)
  const est = e1rm(set.weight, set.reps)
  if (est != null && (r.bestE1rm == null || est > r.bestE1rm)) r.bestE1rm = est
  const w = String(set.weight)
  r.repsAtWeight[w] = Math.max(r.repsAtWeight[w] ?? 0, set.reps)
  return r
}

export const PR_LABEL: Record<PrKind, string> = {
  weight: 'heaviest ever',
  e1rm: 'best estimated 1RM',
  reps: 'most reps at this weight',
}
