import type { Exercise, LiftProgression, Session, WeekDoc } from './schema'
import { todayIsoInAppTimeZone } from './app-timezone'

// Maps exercise names (lowercase, partial) to the canonical lift_progression keys
// used by the charts. More-specific patterns must come before generic ones.
// Add entries here when new tracked lifts are introduced.
const EXERCISE_NAME_TO_KEY: Array<[pattern: string, key: string]> = [
  ['incline dumbbell bench', 'incline_db_kg'],
  ['incline dumbell bench', 'incline_db_kg'],
  ['incline db bench', 'incline_db_kg'],
  ['dumbbell bench press', 'sunday_db_bench_kg'],
  ['dumbell bench press', 'sunday_db_bench_kg'],
  ['db bench press', 'sunday_db_bench_kg'],
  ['romanian deadlift', 'romanian_deadlift_kg'],
  ['barbell deadlift', 'deadlift_kg'],
  ['barbell bench press', 'bench_press_kg'],
  ['deadlift', 'deadlift_kg'],
  ['weighted pull', 'weighted_pullups_added_kg'],
  ['bench press', 'bench_press_kg'],
  ['push press', 'push_press_kg'],
  ['overhead press', 'push_press_kg'],
  ['ohp', 'push_press_kg'],
]

// Implement qualifiers that make a lift a different movement for charting purposes.
// A dumbbell push press at 22kg/hand must not land on the barbell push-press line.
// Order matters: "smith machine" is smith, not machine.
const IMPLEMENT_PREFIXES: Array<[pattern: RegExp, prefix: string]> = [
  [/\bsmith\b/, 'smith_'],
  [/\b(trap|hex) bar\b/, 'trap_bar_'],
  [/\bmachine\b/, 'machine_'],
  [/\b(dumbbells?|dumbells?|db)\b/, 'db_'],
  [/\b(kettlebells?|kb)\b/, 'kb_'],
  [/\bcable\b/, 'cable_'],
]

function slugKey(lower: string): string {
  return (
    lower
      .replace(/[\s\-\/]+/g, '_')
      .replace(/[^a-z0-9_]/g, '') + '_kg'
  )
}

export function nameToKey(name: string): string {
  const lower = name.toLowerCase()
  const implementPrefix = IMPLEMENT_PREFIXES.find(([re]) => re.test(lower))?.[1] ?? ''

  // Legacy dumbbell-bench keys predate the implement prefixes; keep them so
  // existing history stays on the same chart line.
  if (implementPrefix === 'db_' && lower.includes('bench')) {
    return lower.includes('incline') ? 'incline_db_kg' : 'sunday_db_bench_kg'
  }

  for (const [pattern, key] of EXERCISE_NAME_TO_KEY) {
    if (lower.includes(pattern)) return implementPrefix + key
  }
  return slugKey(lower)
}

// Entries the athlete flagged (injury, illness, a deliberately light day) stay
// in the log but must not move the progression lines.
export function isProgressExcluded(item: { exclude_from_progress?: boolean | null }): boolean {
  return item.exclude_from_progress === true
}

export function updateLiftProgression(
  exercises: Exercise[],
  current: LiftProgression,
): LiftProgression {
  const updated = { ...current }
  for (const ex of exercises) {
    if (
      !isProgressExcluded(ex) &&
      ex.actual_weight_kg != null &&
      Number.isFinite(ex.actual_weight_kg) &&
      ex.actual_weight_kg > 0
    ) {
      const key = nameToKey(ex.name)
      updated[key] = ex.actual_weight_kg
    }
  }
  return updated
}

export function progressionFromCompletedStrengthSessions(sessions: Session[]): LiftProgression {
  const todayIso = todayIsoInAppTimeZone()
  let progression: LiftProgression = {}
  for (const session of sessions) {
    if (session.date > todayIso) continue
    if (session.status !== 'completed' || session.type !== 'Strength') continue
    if (isProgressExcluded(session)) continue
    progression = updateLiftProgression(session.exercises, progression)
  }
  return progression
}

function numericEntries(progression: LiftProgression): Record<string, number> {
  return Object.fromEntries(
    Object.entries(progression)
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .map(([k, v]) => [k, v as number]),
  )
}

// The lifts a week counts toward progression. Derived from the logged sessions
// so stored `lift_progression` values written by older matching rules can't leak
// into charts or coach context. Falls back to the stored values only for weeks
// with no counted strength work (seeded or carried-forward weeks).
export function liftsForWeek(week: Pick<WeekDoc, 'sessions' | 'lift_progression'>): Record<string, number> {
  const derived = numericEntries(progressionFromCompletedStrengthSessions(week.sessions))
  if (Object.keys(derived).length > 0) return derived
  return numericEntries(week.lift_progression ?? {})
}

// Heaviest weight per lift key among entries kept off the charts, so the UI can
// still show "you trained this, it just doesn't count" without bending the line.
export function excludedLiftWeights(sessions: Session[]): Record<string, number> {
  const todayIso = todayIsoInAppTimeZone()
  const out: Record<string, number> = {}
  for (const session of sessions) {
    if (session.date > todayIso) continue
    if (session.status !== 'completed' || session.type !== 'Strength') continue
    const sessionExcluded = isProgressExcluded(session)
    for (const ex of session.exercises) {
      if (!sessionExcluded && !isProgressExcluded(ex)) continue
      const w = ex.actual_weight_kg
      if (w == null || !Number.isFinite(w) || w <= 0) continue
      const key = nameToKey(ex.name)
      out[key] = Math.max(out[key] ?? 0, w)
    }
  }
  return out
}
