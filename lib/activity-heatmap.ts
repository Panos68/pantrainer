import type { Session } from './schema'

// A GitHub-style year grid of training days: one column per week (Monday
// first), one cell per day, shaded by how much was done that day.

export interface HeatmapDay {
  date: string
  sessions: number
  types: string[]
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
  inFuture: boolean
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const offset = (d.getUTCDay() + 6) % 7
  return addDays(iso, -offset)
}

// Level from training minutes (falls back to session count when no duration).
export function dayLevel(sessions: number, minutes: number): HeatmapDay['level'] {
  if (sessions === 0) return 0
  if (minutes <= 0) return sessions >= 2 ? 3 : 2
  if (minutes < 30) return 1
  if (minutes < 60) return 2
  if (minutes < 100) return 3
  return 4
}

export function buildHeatmap(sessions: Session[], today: string, weeks = 53): HeatmapDay[][] {
  const byDate = new Map<string, { sessions: number; types: Set<string>; minutes: number }>()
  for (const s of sessions) {
    if (s.status !== 'completed' || s.type === 'Rest') continue
    const e = byDate.get(s.date) ?? { sessions: 0, types: new Set<string>(), minutes: 0 }
    e.sessions++
    e.types.add(s.type)
    e.minutes += s.duration_min ?? 0
    byDate.set(s.date, e)
  }

  const start = addDays(mondayOf(today), -7 * (weeks - 1))
  const columns: HeatmapDay[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapDay[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const e = byDate.get(date)
      col.push({
        date,
        sessions: e?.sessions ?? 0,
        types: e ? [...e.types] : [],
        minutes: e?.minutes ?? 0,
        level: e ? dayLevel(e.sessions, e.minutes) : 0,
        inFuture: date > today,
      })
    }
    columns.push(col)
  }
  return columns
}

export function streakStats(columns: HeatmapDay[][]): { activeDays: number; longestWeekStreak: number; currentWeekStreak: number } {
  const days = columns.flat().filter((d) => !d.inFuture)
  const activeDays = days.filter((d) => d.sessions > 0).length
  // Weeks with at least one session, counted consecutively.
  const activeWeeks = columns.map((col) => col.some((d) => d.sessions > 0 && !d.inFuture))
  let longest = 0
  let run = 0
  for (const active of activeWeeks) {
    run = active ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  let current = 0
  for (let i = activeWeeks.length - 1; i >= 0; i--) {
    // The current week may not have a session yet; don't break the streak on it.
    if (i === activeWeeks.length - 1 && !activeWeeks[i]) continue
    if (!activeWeeks[i]) break
    current++
  }
  return { activeDays, longestWeekStreak: longest, currentWeekStreak: current }
}
