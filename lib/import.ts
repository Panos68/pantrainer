import { WeekDocSchema } from './schema'
import type { WeekDoc } from './schema'
import { readCurrentWeek, writeCurrentWeek, archiveWeek, readAppState } from './data'
import { advanceGymWeek, incrementDeloadCounter, resetDeloadCounter, unflagDeloadWeek } from './state'

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

// Apply the imported plan: archive current week, create new week from imported data
export function applyImport(importedDoc: WeekDoc): WeekDoc {
  const currentWeek = readCurrentWeek()

  // Archive current week
  if (currentWeek) {
    archiveWeek(currentWeek)
  }

  // Handle deload state
  const state = readAppState()
  if (state.isDeloadWeek) {
    resetDeloadCounter()
    unflagDeloadWeek()
  } else {
    incrementDeloadCounter()
  }

  // Advance gym alternation
  advanceGymWeek()

  // The imported doc IS the new current week
  // But we need to ensure sessions are reset to 'planned' if they came from Claude
  // (Claude returns next_week_plan, not sessions — so we generate fresh sessions)
  // If Claude included sessions, keep them. If not, they'll be generated on new week creation.
  // For now: write the imported doc as-is (sessions will be seeded by /api/week/new)
  writeCurrentWeek(importedDoc)

  return importedDoc
}
