import type { Exercise, Session } from './schema'
import { isProgressExcluded, nameToKey } from './progression'

// Next-session targets with a plain-language reason, using double progression:
// hit the top of the rep range on every set → add load; otherwise repeat the
// load and build reps; stuck at the same load for several sessions → deload.
// Missed reps never add load, and any change of load restarts the stall count,
// so deloads can't spiral.

export interface ExercisePerformance {
  date: string
  weight: number // working (heaviest) weight that session
  reps: number[] // reps of every set done at that weight
  repRange: [number, number]
  hard: boolean // any set at that weight marked "hard"
}

export type SuggestionAction = 'increase' | 'build_reps' | 'repeat' | 'deload'

export interface ProgressionSuggestion {
  key: string
  name: string
  action: SuggestionAction
  targetWeight: number
  targetReps: number
  reason: string
}

export const STALL_SESSIONS = 3
export const DELOAD_FACTOR = 0.9

// "5" → [5,5], "8-10" / "8–10" → [8,10]; anything else (AMRAP, "30s") → null.
export function parseRepRange(reps: Exercise['reps']): [number, number] | null {
  if (typeof reps === 'number') return reps > 0 ? [reps, reps] : null
  if (typeof reps !== 'string') return null
  const range = reps.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    return lo > 0 && hi >= lo ? [lo, hi] : null
  }
  const single = reps.trim().match(/^(\d+)$/)
  return single && Number(single[1]) > 0 ? [Number(single[1]), Number(single[1])] : null
}

// Smallest sensible jump: lower-body barbell lifts move in 5 kg, dumbbells and
// kettlebells in 2 kg, everything else in 2.5 kg.
export function weightIncrement(key: string): number {
  if (key.startsWith('db_') || key.startsWith('kb_') || key.includes('_db_') || key === 'incline_db_kg' || key === 'sunday_db_bench_kg') return 2
  if (/(deadlift|squat|leg_press|hip_thrust)/.test(key)) return 5
  return 2.5
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function fmt(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace(/\.0$/, '')} kg`
}

export function performanceFromExercise(date: string, ex: Exercise): ExercisePerformance | null {
  const repRange = parseRepRange(ex.reps)
  if (!repRange) return null
  const log = (ex.set_log ?? []).filter((s) => s.weight_kg != null && s.weight_kg > 0)
  if (log.length > 0) {
    const weight = Math.max(...log.map((s) => s.weight_kg as number))
    const atWeight = log.filter((s) => s.weight_kg === weight)
    return { date, weight, reps: atWeight.map((s) => s.reps), repRange, hard: atWeight.some((s) => s.effort === 'hard') }
  }
  const weight = ex.actual_weight_kg
  const reps = typeof ex.actual_reps === 'number' ? ex.actual_reps : Number(ex.actual_reps)
  if (weight == null || !(weight > 0) || !Number.isFinite(reps) || reps <= 0) return null
  return { date, weight, reps: Array.from({ length: Math.max(1, ex.actual_sets ?? 1) }, () => reps), repRange, hard: ex.effort === 'hard' }
}

export function suggestNext(key: string, name: string, history: ExercisePerformance[]): ProgressionSuggestion | null {
  if (history.length === 0) return null
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const last = sorted[sorted.length - 1]
  const [lo, hi] = last.repRange
  const step = weightIncrement(key)
  const setsText = last.reps.join(', ')
  const hitTop = last.reps.length > 0 && last.reps.every((r) => r >= hi)
  const hitFloor = last.reps.every((r) => r >= lo)

  if (hitTop && !last.hard) {
    const targetWeight = last.weight + step
    return {
      key, name, action: 'increase', targetWeight, targetReps: lo,
      reason: `Every set hit ${hi}+ reps at ${fmt(last.weight)} (${setsText}) — add ${fmt(step)}.`,
    }
  }

  // Consecutive most-recent sessions at this exact weight without hitting the top.
  let stalled = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    if (p.weight !== last.weight) break
    if (p.reps.every((r) => r >= p.repRange[1])) break
    stalled++
  }

  if (stalled >= STALL_SESSIONS) {
    const targetWeight = Math.max(step, roundTo(last.weight * DELOAD_FACTOR, step))
    return {
      key, name, action: 'deload', targetWeight, targetReps: hi,
      reason: `${stalled} sessions at ${fmt(last.weight)} without hitting ${hi} reps — deload to ${fmt(targetWeight)} and build back up.`,
    }
  }

  if (hitTop && last.hard) {
    return {
      key, name, action: 'repeat', targetWeight: last.weight, targetReps: hi,
      reason: `Hit ${hi} reps at ${fmt(last.weight)} but it felt hard — repeat it once more before adding load.`,
    }
  }

  if (lo < hi && hitFloor) {
    const targetReps = Math.min(hi, Math.min(...last.reps) + 1)
    return {
      key, name, action: 'build_reps', targetWeight: last.weight, targetReps,
      reason: `Stay at ${fmt(last.weight)} and push for ${targetReps} reps on every set (last: ${setsText}); add load once all sets reach ${hi}.`,
    }
  }

  return {
    key, name, action: 'repeat', targetWeight: last.weight, targetReps: lo,
    reason: `Missed reps at ${fmt(last.weight)} (${setsText}) — repeat until every set reaches ${lo}. Missed reps never add load.`,
  }
}

// Suggestions for every lift with numeric planned reps, from completed,
// non-excluded strength sessions (oldest first or any order).
export function suggestionsFromSessions(sessions: Session[]): Map<string, ProgressionSuggestion> {
  const history = new Map<string, { name: string; perf: ExercisePerformance[] }>()
  for (const session of sessions) {
    if (session.status !== 'completed' || session.type !== 'Strength' || isProgressExcluded(session)) continue
    for (const ex of session.exercises) {
      if (isProgressExcluded(ex)) continue
      const perf = performanceFromExercise(session.date, ex)
      if (!perf) continue
      const key = nameToKey(ex.name)
      const entry = history.get(key) ?? { name: ex.name, perf: [] }
      entry.name = ex.name
      entry.perf.push(perf)
      history.set(key, entry)
    }
  }
  const out = new Map<string, ProgressionSuggestion>()
  for (const [key, { name, perf }] of history) {
    const s = suggestNext(key, name, perf)
    if (s) out.set(key, s)
  }
  return out
}
