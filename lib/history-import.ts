import type { Exercise, Session, SetEntry, WeekDoc } from './schema'

// Import workout history exported from Strong or Hevy (CSV). Pure: parsing,
// normalising and grouping into archived weeks. The API route decides what to
// write and never overwrites days that already have sessions in the app.

export type ImportFormat = 'strong' | 'hevy'

export interface ImportedSet {
  date: string // YYYY-MM-DD as recorded by the source app
  startTime: string // sortable "YYYY-MM-DD HH:mm"
  workout: string
  durationMin: number | null
  exercise: string
  weightKg: number | null
  reps: number
  rpe: number | null
  notes: string | null
}

const LB_TO_KG = 0.45359237

// RFC 4180-ish: quoted fields, escaped quotes, CRLF, and ',' or ';' delimiters
// (Strong uses ';' in some locales).
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

function headerIndex(header: string[]): (name: string) => number {
  const normalized = header.map((h) => h.trim().toLowerCase())
  return (name) => normalized.indexOf(name.toLowerCase())
}

export function detectFormat(header: string[]): ImportFormat | null {
  const idx = headerIndex(header)
  if (idx('exercise_title') >= 0 && idx('start_time') >= 0) return 'hevy'
  if (idx('exercise name') >= 0 && idx('date') >= 0) return 'strong'
  return null
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// "2024-03-12 07:30:00", "2024-03-12T07:30", "12 Mar 2024, 07:30" → "2024-03-12 07:30"
export function normalizeDateTime(value: string): string | null {
  const v = value.trim()
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${(iso[4] ?? '00').padStart(2, '0')}:${iso[5] ?? '00'}`
  const human = v.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})/)
  if (human) {
    const month = MONTHS[human[2].toLowerCase()]
    if (!month) return null
    return `${human[3]}-${month}-${human[1].padStart(2, '0')} ${human[4].padStart(2, '0')}:${human[5]}`
  }
  return null
}

// Strong: "1h 5m", "45m", "50s"; Hevy has start/end times instead.
function parseStrongDuration(value: string | undefined): number | null {
  if (!value) return null
  const h = Number(value.match(/(\d+)\s*h/)?.[1] ?? 0)
  const m = Number(value.match(/(\d+)\s*m(?!s)/)?.[1] ?? 0)
  const total = h * 60 + m
  return total > 0 ? total : null
}

function minutesBetween(start: string, end: string): number | null {
  const a = Date.parse(start.replace(' ', 'T'))
  const b = Date.parse(end.replace(' ', 'T'))
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return Math.round((b - a) / 60000)
}

function num(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function roundKg(kg: number): number {
  return Math.round(kg * 4) / 4
}

export function parseHistoryCsv(text: string): { format: ImportFormat; sets: ImportedSet[]; skippedRows: number } {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('The file has no workout rows')
  const [header, ...body] = rows
  const format = detectFormat(header)
  if (!format) throw new Error('Not a Strong or Hevy CSV export (unrecognised columns)')
  const idx = headerIndex(header)
  const get = (row: string[], name: string) => {
    const i = idx(name)
    return i >= 0 ? row[i] : undefined
  }

  const sets: ImportedSet[] = []
  let skippedRows = 0
  for (const row of body) {
    let startTime: string | null
    let workout: string
    let durationMin: number | null
    let exercise: string
    let weight: number | null
    let reps: number | null
    let isWarmup: boolean

    if (format === 'strong') {
      startTime = normalizeDateTime(get(row, 'Date') ?? '')
      workout = (get(row, 'Workout Name') ?? '').trim() || 'Workout'
      durationMin = parseStrongDuration(get(row, 'Duration'))
      exercise = (get(row, 'Exercise Name') ?? '').trim()
      const unit = (get(row, 'Weight Unit') ?? 'kg').trim().toLowerCase()
      const rawWeight = num(get(row, 'Weight'))
      weight = rawWeight == null ? null : unit.startsWith('lb') ? roundKg(rawWeight * LB_TO_KG) : rawWeight
      reps = num(get(row, 'Reps'))
      isWarmup = (get(row, 'Set Order') ?? '').trim().toUpperCase() === 'W'
    } else {
      startTime = normalizeDateTime(get(row, 'start_time') ?? '')
      const end = normalizeDateTime(get(row, 'end_time') ?? '')
      workout = (get(row, 'title') ?? '').trim() || 'Workout'
      durationMin = startTime && end ? minutesBetween(startTime, end) : null
      exercise = (get(row, 'exercise_title') ?? '').trim()
      const kg = num(get(row, 'weight_kg'))
      const lbs = num(get(row, 'weight_lbs'))
      weight = kg ?? (lbs != null ? roundKg(lbs * LB_TO_KG) : null)
      reps = num(get(row, 'reps'))
      isWarmup = (get(row, 'set_type') ?? '').trim().toLowerCase() === 'warmup'
    }

    // Warm-ups would distort working weights; timed/distance-only sets have no reps.
    if (!startTime || !exercise || isWarmup || reps == null || reps <= 0) {
      skippedRows++
      continue
    }
    sets.push({
      date: startTime.slice(0, 10),
      startTime,
      workout,
      durationMin,
      exercise,
      weightKg: weight != null && weight > 0 ? weight : null,
      reps: Math.round(reps),
      rpe: num(get(row, format === 'strong' ? 'RPE' : 'rpe')),
      notes: (get(row, format === 'strong' ? 'Notes' : 'exercise_notes') ?? '').trim() || null,
    })
  }
  return { format, sets, skippedRows }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function dayName(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
}

function modal(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
}

export function setsToSessions(sets: ImportedSet[], format: ImportFormat): Session[] {
  const byWorkout = new Map<string, ImportedSet[]>()
  for (const s of sets) {
    const key = `${s.startTime}|${s.workout}`
    byWorkout.set(key, [...(byWorkout.get(key) ?? []), s])
  }
  const source = format === 'strong' ? 'Strong' : 'Hevy'
  const sessions: Session[] = []
  for (const workoutSets of byWorkout.values()) {
    const first = workoutSets[0]
    const byExercise = new Map<string, ImportedSet[]>()
    for (const s of workoutSets) byExercise.set(s.exercise, [...(byExercise.get(s.exercise) ?? []), s])
    const exercises: Exercise[] = [...byExercise.entries()].map(([name, exSets]) => {
      const setLog: SetEntry[] = exSets.map((s) => ({ reps: s.reps, weight_kg: s.weightKg, effort: null, completed_at: `${s.startTime.replace(' ', 'T')}:00` }))
      const weights = exSets.map((s) => s.weightKg).filter((w): w is number => w != null)
      const repsTarget = modal(exSets.map((s) => s.reps))
      return {
        name,
        sets: exSets.length,
        reps: repsTarget,
        weight_kg: weights.length > 0 ? Math.max(...weights) : null,
        actual_sets: exSets.length,
        actual_reps: repsTarget,
        actual_weight_kg: weights.length > 0 ? Math.max(...weights) : null,
        effort: null,
        actual_note: exSets.find((s) => s.notes)?.notes ?? null,
        set_log: setLog,
        alternatives: [],
      }
    })
    const rpes = workoutSets.map((s) => s.rpe).filter((r): r is number => r != null && r >= 1 && r <= 10)
    sessions.push({
      date: first.date,
      day: dayName(first.date),
      type: 'Strength',
      subtype: first.workout,
      exercises,
      duration_min: first.durationMin,
      notes: `Imported from ${source}`,
      status: 'completed',
      photos: [],
      muscle_groups: [],
      source: 'manual',
      rpe: rpes.length > 0 ? Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
    } as Session)
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date))
}

export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// "Apr 14–20, 2026" / "Mar 30 – Apr 5, 2026", matching how the app labels weeks.
export function weekLabel(monday: string): string {
  const start = new Date(`${monday}T12:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const mon = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return mon(start) === mon(end)
    ? `${mon(start)} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`
    : `${mon(start)} ${start.getUTCDate()} – ${mon(end)} ${end.getUTCDate()}, ${end.getUTCFullYear()}`
}

export function importWeekId(monday: string): string {
  return `archive-import-${monday}`
}

export interface ImportPlan {
  weeks: Array<{ id: string; week: WeekDoc }>
  importedSessions: number
  skippedExistingDays: string[]
  dateRange: [string, string] | null
  exerciseCount: number
}

// Groups sessions into Monday-start weeks, skipping any day that already has
// a session in the app so an import can never duplicate or overwrite.
export function planImport(sessions: Session[], existingDates: Set<string>, athlete: WeekDoc['athlete']): ImportPlan {
  const skipped = new Set<string>()
  const kept = sessions.filter((s) => {
    if (existingDates.has(s.date)) { skipped.add(s.date); return false }
    return true
  })
  const byWeek = new Map<string, Session[]>()
  for (const s of kept) {
    const monday = mondayOf(s.date)
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), s])
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, weekSessions]) => ({
    id: importWeekId(monday),
    week: {
      week: weekLabel(monday),
      athlete,
      sessions: weekSessions,
      week_summary: {
        total_sessions: weekSessions.length,
        high_output_days: 0,
        strength_days: weekSessions.length,
        recovery_days: 0,
        total_calories: 0,
        notes: '',
      },
      lift_progression: {},
      health_flags: [],
      next_week_plan: {},
      garmin_recovery: {},
      renpho_measurements: {},
      daily_readiness: {},
      daily_scores: {},
    } as unknown as WeekDoc,
  }))
  const dates = kept.map((s) => s.date).sort()
  return {
    weeks,
    importedSessions: kept.length,
    skippedExistingDays: [...skipped].sort(),
    dateRange: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : null,
    exerciseCount: new Set(kept.flatMap((s) => s.exercises.map((e) => e.name))).size,
  }
}

// A week id may already hold sessions from an earlier import. Merge instead of
// replacing so a second import can only ever add sessions, never drop them.
export function mergeImportedWeek(existing: WeekDoc | null, incoming: WeekDoc): WeekDoc {
  if (!existing) return incoming
  const seen = new Set(existing.sessions.map((s) => `${s.date}|${s.subtype ?? ''}`))
  const added = incoming.sessions.filter((s) => !seen.has(`${s.date}|${s.subtype ?? ''}`))
  const sessions = [...existing.sessions, ...added].sort((a, b) => a.date.localeCompare(b.date))
  const completed = sessions.filter((s) => s.status === 'completed')
  return {
    ...existing,
    sessions,
    week_summary: {
      ...existing.week_summary,
      total_sessions: completed.length,
      strength_days: completed.filter((s) => s.type === 'Strength').length,
    },
  }
}
