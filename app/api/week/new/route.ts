import fs from 'fs'
import path from 'path'
import { readCurrentWeek, readAthleteProfile, writeCurrentWeek, archiveWeek } from '@/lib/data'
import { incrementDeloadCounter } from '@/lib/state'
import { startOfISOWeek, addDays, format, addWeeks } from 'date-fns'
import type { WeekDoc, Session, NextWeekPlan } from '@/lib/schema'

function getNextWeekRange(): { label: string; startDate: Date } {
  const nextMonday = addWeeks(startOfISOWeek(new Date()), 1)
  const nextSunday = addDays(nextMonday, 6)
  const label = `${format(nextMonday, 'MMM d')}–${format(nextSunday, 'd, yyyy')}`
  return { label, startDate: nextMonday }
}

function getDayDates(startDate: Date): Record<string, Date> {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return Object.fromEntries(days.map((day, i) => [day.toLowerCase(), addDays(startDate, i)]))
}

function inferSessionType(planText: string): string {
  const lower = planText.toLowerCase()
  if (lower.includes('hyrox') || lower.includes('hiit') || lower.includes('wod') || lower.includes('conditioning')) return 'Conditioning'
  if (lower.includes('strength') || lower.includes('pull') || lower.includes('push') || lower.includes('gym')) return 'Strength'
  if (lower.includes('mobility') || lower.includes('recovery') || lower.includes('active')) return 'Recovery'
  if (lower.includes('rest') || lower.includes('optional')) return 'Rest'
  return 'Recovery'
}

// POST /api/week/new
// Creates a new week document from the previous week's next_week_plan and lift_progression
export async function POST() {
  const prevWeek = readCurrentWeek()
  const athlete = readAthleteProfile()

  if (!athlete) {
    return Response.json({ error: 'Athlete profile not found' }, { status: 400 })
  }

  const { label, startDate } = getNextWeekRange()
  const dayDates = getDayDates(startDate)

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const dayNames: Record<string, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  }

  // Archive previous week before creating new one
  if (prevWeek) {
    archiveWeek(prevWeek)
  }

  const nextWeekPlan: NextWeekPlan = prevWeek?.next_week_plan ?? {}

  const sessions: Session[] = days.map((dayKey) => {
    const planText: string = (nextWeekPlan[dayKey] as string | undefined) ?? ''
    const date = format(dayDates[dayKey], 'yyyy-MM-dd')
    return {
      date,
      day: dayNames[dayKey],
      type: inferSessionType(planText),
      subtype: planText || null,
      status: 'planned' as const,
      duration_min: null,
      avg_hr_bpm: null,
      total_calories: null,
      notes: '',
      photos: [],
    }
  })

  // Carry uncleared health flags from previous week
  const healthFlags = (prevWeek?.health_flags ?? []).filter((f) => !f.cleared)

  const newWeek: WeekDoc = {
    week: label,
    athlete,
    sessions,
    week_summary: {
      total_sessions: 0,
      high_output_days: 0,
      strength_days: 0,
      recovery_days: 0,
      total_calories: 0,
    },
    lift_progression: (() => {
      let liftProgression = prevWeek?.lift_progression ?? {}
      if (Object.keys(liftProgression).length === 0) {
        const baselinePath = path.join(process.cwd(), 'data', 'lift-progression.json')
        if (fs.existsSync(baselinePath)) {
          try {
            liftProgression = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))
          } catch { /* ignore */ }
        }
      }
      return liftProgression
    })(),
    health_flags: healthFlags,
    next_week_plan: {},
  }

  writeCurrentWeek(newWeek)

  // Increment deload counter each time a new week is started
  incrementDeloadCounter()

  return Response.json(newWeek)
}
