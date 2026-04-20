import { WeekDocSchema } from './schema'
import type { WeekDoc } from './schema'
import { readCurrentWeek, writeCurrentWeek } from './data'


export interface ImportResult {
  ok: true
  data: WeekDoc
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

// Validate Claude's JSON response
export function validateImport(raw: string): ImportResult | ImportError {
  try {
    const parsed = JSON.parse(raw)
    const result = WeekDocSchema.safeParse(parsed)
    if (!result.success) {
      return {
        ok: false,
        raw,
        errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
      }
    }
    return {
      ok: true,
      data: result.data,
      nextWeek: {
        week: result.data.week,
        gymWeek: result.data.next_week_plan?.wednesday?.toLowerCase().includes('pull') ? 'week_a' : 'week_b',
        sessionsCount: Object.keys(result.data.next_week_plan ?? {}).filter(k => k !== 'notes').length,
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

// Apply the imported plan: update current week in place, preserving completed sessions.
// Always ensures all 7 days exist with correct dates — guards against Claude omitting days.
export async function applyImport(importedDoc: WeekDoc): Promise<WeekDoc> {
  const currentWeek = await readCurrentWeek()

  // Build lookup of completed/skipped sessions to preserve
  const preservedByDay: Record<string, WeekDoc['sessions'][number]> = {}
  if (currentWeek) {
    for (const s of currentWeek.sessions) {
      if (s.status === 'completed' || s.status === 'skipped') {
        preservedByDay[s.day] = s
      }
    }
  }

  // Build lookup of imported sessions by day
  const importedByDay: Record<string, WeekDoc['sessions'][number]> = {}
  for (const s of importedDoc.sessions) {
    importedByDay[s.day] = s
  }

  // Derive the week's Monday date from the first available session date
  // so we can fill in missing days with correct dates
  const firstSession = importedDoc.sessions.find((s) => s.date)
  let mondayDate: Date | null = null
  if (firstSession) {
    const d = new Date(firstSession.date + 'T12:00:00')
    const dayIndex = ALL_DAYS.indexOf(firstSession.day)
    if (dayIndex >= 0) {
      mondayDate = new Date(d)
      mondayDate.setDate(d.getDate() - dayIndex)
    }
  }

  const mergedSessions = ALL_DAYS.map((dayName, i) => {
    // Preserved session takes priority
    if (preservedByDay[dayName]) return preservedByDay[dayName]

    // Use imported session if present
    if (importedByDay[dayName]) return importedByDay[dayName]

    // Fill missing day with a rest session using the correct date
    const date = mondayDate
      ? new Date(mondayDate.getTime() + i * 86400000).toISOString().slice(0, 10)
      : ''
    return {
      date,
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
    }
  })

  const merged: WeekDoc = {
    ...importedDoc,
    sessions: mergedSessions,
  }

  await writeCurrentWeek(merged)
  return merged
}
