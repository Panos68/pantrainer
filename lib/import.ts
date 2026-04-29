import { z } from 'zod'
import { WeekDocSchema } from './schema'
import type { WeekDoc } from './schema'
import { archiveWeek, clearPendingWeek, readCurrentWeek, writeCurrentWeek, writePendingWeek } from './data'
import { rollDeloadCounterOnWeekAdvance } from './state'
import { addDays, format, parseISO } from 'date-fns'


export interface ImportResult {
  ok: true
  data: WeekDoc
  analysis_text: string | null
  nextWeek: {
    week: string
    gymWeek: string
    sessionsCount: number
  }
}

export interface ImportError {
  ok: false
  raw: string
  errors: string[]
}

export interface ApplyImportResult {
  week: WeekDoc
  activation: 'immediate' | 'scheduled'
}

function normalizeSessionType(type: string): string {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'strength') return 'Strength'
  if (normalized === 'conditioning') return 'Conditioning'
  if (normalized === 'recovery') return 'Recovery'
  if (normalized === 'rest') return 'Rest'
  return type
}

export function normalizeWeekDocSessionTypes(weekDoc: WeekDoc): WeekDoc {
  return {
    ...weekDoc,
    sessions: weekDoc.sessions.map((session) => ({
      ...session,
      type: normalizeSessionType(session.type),
    })),
  }
}

// Validate Claude's JSON response
export function validateImport(raw: string): ImportResult | ImportError {
  try {
    const parsed = JSON.parse(raw)
    const envelopeSchema = z.object({
      week_doc: WeekDocSchema,
      analysis_text: z.string().nullable().optional(),
    })
    const envelopeResult = envelopeSchema.safeParse(parsed)
    if (envelopeResult.success) {
      const weekDoc = normalizeWeekDocSessionTypes(envelopeResult.data.week_doc)
      return {
        ok: true,
        data: weekDoc,
        analysis_text: envelopeResult.data.analysis_text ?? null,
        nextWeek: {
          week: weekDoc.week,
          gymWeek: weekDoc.next_week_plan?.wednesday?.toLowerCase().includes('pull') ? 'week_a' : 'week_b',
          sessionsCount: Object.keys(weekDoc.next_week_plan ?? {}).filter(k => k !== 'notes').length,
        }
      }
    }

    const weekDocResult = WeekDocSchema.safeParse(parsed)
    if (!weekDocResult.success) {
      return {
        ok: false,
        raw,
        errors: weekDocResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
      }
    }
    return {
      ok: true,
      data: normalizeWeekDocSessionTypes(weekDocResult.data),
      analysis_text: null,
      nextWeek: {
        week: weekDocResult.data.week,
        gymWeek: weekDocResult.data.next_week_plan?.wednesday?.toLowerCase().includes('pull') ? 'week_a' : 'week_b',
        sessionsCount: Object.keys(weekDocResult.data.next_week_plan ?? {}).filter(k => k !== 'notes').length,
      }
    }
  } catch (e) {
    return {
      ok: false,
      raw,
      errors: [`JSON parse error: ${e instanceof Error ? e.message : 'invalid JSON'}`]
    }
  }
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

class ApplyImportError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] ?? 'Import could not be applied')
    this.name = 'ApplyImportError'
  }
}

function parseDateAtNoon(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  try {
    const parsed = parseISO(date)
    if (Number.isNaN(parsed.getTime())) return null
    parsed.setHours(12, 0, 0, 0)
    return parsed
  } catch {
    return null
  }
}

function deriveMondayFromSessions(sessions: WeekDoc['sessions']): Date | null {
  for (const session of sessions) {
    const dayIndex = ALL_DAYS.indexOf(session.day)
    const date = parseDateAtNoon(session.date)
    if (dayIndex >= 0 && date) {
      const monday = new Date(date)
      monday.setDate(date.getDate() - dayIndex)
      monday.setHours(12, 0, 0, 0)
      return monday
    }
  }
  return null
}

function hasStartedSessions(sessions: WeekDoc['sessions']): boolean {
  return sessions.some((s) => s.status === 'in_progress' || s.status === 'completed' || s.status === 'skipped')
}

function weekLabelFromMonday(monday: Date): string {
  const sunday = addDays(monday, 6)
  return `${format(monday, 'MMM d')}–${format(sunday, 'd, yyyy')}`
}

function expectedDateByDay(monday: Date): Record<string, string> {
  return Object.fromEntries(
    ALL_DAYS.map((day, i) => [day, format(addDays(monday, i), 'yyyy-MM-dd')]),
  )
}

function sanitizeImportedSession(
  session: WeekDoc['sessions'][number],
  date: string,
  day: string,
): WeekDoc['sessions'][number] {
  return {
    ...session,
    day,
    date,
    status: 'planned',
    duration_min: null,
    avg_hr_bpm: null,
    total_calories: null,
    garmin_activity_id: null,
    source: undefined,
    aerobic_training_effect: null,
    anaerobic_training_effect: null,
    training_stress_score: null,
    hr_zones: null,
    exercises: (session.exercises ?? []).map((exercise) => ({
      ...exercise,
      actual_sets: undefined,
      actual_reps: undefined,
      actual_weight_kg: undefined,
      effort: null,
    })),
  }
}

function validateAndDecideMode(
  currentWeek: WeekDoc | null,
  importedDoc: WeekDoc,
): { importedMonday: Date; mode: 'replace_current' | 'advance_next' } {
  const importedMonday = deriveMondayFromSessions(importedDoc.sessions)
  if (!importedMonday) {
    throw new ApplyImportError(['Imported plan must include at least one valid dated session (YYYY-MM-DD).'])
  }

  const expectedImportedDates = expectedDateByDay(importedMonday)
  const errors: string[] = []

  for (const session of importedDoc.sessions) {
    if (!ALL_DAYS.includes(session.day)) {
      errors.push(`Invalid day "${session.day}" in imported sessions.`)
      continue
    }
    const expectedDate = expectedImportedDates[session.day]
    if (session.date !== expectedDate) {
      errors.push(`Date mismatch for ${session.day}: expected ${expectedDate}, got ${session.date}.`)
    }
  }

  if (errors.length > 0) {
    throw new ApplyImportError(errors)
  }

  if (!currentWeek) {
    return { importedMonday, mode: 'replace_current' }
  }

  const currentMonday = deriveMondayFromSessions(currentWeek.sessions)
  if (!currentMonday) {
    return { importedMonday, mode: 'replace_current' }
  }

  const importedKey = importedMonday.toISOString().slice(0, 10)
  const currentKey = currentMonday.toISOString().slice(0, 10)
  const nextKey = addDays(currentMonday, 7).toISOString().slice(0, 10)

  const isCurrentWeek = importedKey === currentKey
  const isNextWeek = importedKey === nextKey

  if (!isCurrentWeek && !isNextWeek) {
    throw new ApplyImportError([
      `Imported week (${weekLabelFromMonday(importedMonday)}) does not match current week (${weekLabelFromMonday(currentMonday)}) or next week (${weekLabelFromMonday(addDays(currentMonday, 7))}).`,
    ])
  }

  if (isCurrentWeek && hasStartedSessions(currentWeek.sessions)) {
    throw new ApplyImportError([
      'Current week already has logged sessions. Import is blocked to prevent losing workout logs.',
      'If you intended to move forward, import the next week (date range must be +7 days).',
    ])
  }

  return { importedMonday, mode: isNextWeek ? 'advance_next' : 'replace_current' }
}

// Apply imported plan safely:
// - only current week (when untouched) or next week can be imported
// - next-week import archives current week first
// - always returns exactly 7 sessions with canonical day/date mapping
export async function applyImport(importedDoc: WeekDoc): Promise<WeekDoc> {
  const normalizedImport = normalizeWeekDocSessionTypes(importedDoc)
  const currentWeek = await readCurrentWeek()
  const { importedMonday, mode } = validateAndDecideMode(currentWeek, normalizedImport)
  const importedWeekStartIso = importedMonday.toISOString().slice(0, 10)
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE ?? 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const importedByDay: Record<string, WeekDoc['sessions'][number]> = {}
  for (const s of normalizedImport.sessions) {
    importedByDay[s.day] = s
  }

  const expectedDates = expectedDateByDay(importedMonday)

  const mergedSessions = ALL_DAYS.map((dayName) => {
    if (importedByDay[dayName]) {
      return sanitizeImportedSession(importedByDay[dayName], expectedDates[dayName], dayName)
    }

    return {
      date: expectedDates[dayName],
      day: dayName,
      type: 'Rest',
      subtype: null,
      exercises: [],
      status: 'planned' as const,
      duration_min: null,
      avg_hr_bpm: null,
      total_calories: null,
      notes: '',
      photos: [],
      muscle_groups: [],
    }
  })

  const merged: WeekDoc = {
    ...normalizedImport,
    sessions: mergedSessions,
  }

  if (mode === 'advance_next' && currentWeek && todayIso < importedWeekStartIso) {
    await writePendingWeek(merged)
    return merged
  }

  if (mode === 'advance_next' && currentWeek) {
    await archiveWeek(currentWeek)
    await rollDeloadCounterOnWeekAdvance()
  }
  await clearPendingWeek()
  await writeCurrentWeek(merged)
  return merged
}

export function isApplyImportError(error: unknown): error is ApplyImportError {
  return error instanceof ApplyImportError
}
