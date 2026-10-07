import type { Exercise, Session, WeekDoc } from './schema'
import { mondayOf, weekLabel } from './history-import'
import { nameToKey } from './progression'
import { suggestionsFromSessions } from './progression-engine'
import { liftSetsFromSessions } from './strength'

// Ready-made weekly plans for athletes who don't (yet) have Claude planning
// for them. A template never touches the app directly: it becomes a normal
// proposal that the athlete reviews and applies on the Plan page, exactly
// like one Claude submits. Weights come from the athlete's own history via
// the progression engine; lifts never done before are left blank.

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

interface TemplateLift {
  name: string
  sets: number
  reps: number | string
  rest?: string
}

interface TemplateSession {
  type: 'Strength' | 'Conditioning' | 'Recovery'
  subtype: string
  lifts?: TemplateLift[]
  durationMin?: number
  notes?: string
  muscles: string[]
}

export interface PlanTemplate {
  id: string
  name: string
  summary: string
  daysPerWeek: number
  goal: 'strength' | 'hybrid' | 'general'
  week: Partial<Record<Day, TemplateSession>>
}

const UPPER_A: TemplateLift[] = [
  { name: 'Barbell Bench Press', sets: 4, reps: '5-8' },
  { name: 'Pendlay Row', sets: 4, reps: '6-8' },
  { name: 'Overhead Press', sets: 3, reps: '6-10' },
  { name: 'Weighted Pull-Ups', sets: 3, reps: '5-8' },
  { name: 'Dumbbell Lateral Raise', sets: 3, reps: '12-15' },
]
const LOWER_A: TemplateLift[] = [
  { name: 'Barbell Back Squat', sets: 4, reps: '5-8' },
  { name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
  { name: 'Walking Lunges', sets: 3, reps: '10-12' },
  { name: 'Leg Curl', sets: 3, reps: '10-12' },
  { name: 'Plank', sets: 3, reps: '45s' },
]
const UPPER_B: TemplateLift[] = [
  { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10' },
  { name: 'Lat Pulldown', sets: 4, reps: '8-12' },
  { name: 'Push Press', sets: 3, reps: '5-6' },
  { name: 'Chest-Supported DB Row', sets: 3, reps: '10-12' },
  { name: 'Cable Face Pull', sets: 3, reps: '12-15' },
]
const LOWER_B: TemplateLift[] = [
  { name: 'Barbell Deadlift', sets: 3, reps: '3-5' },
  { name: 'Bulgarian Split Squat', sets: 3, reps: '8-10' },
  { name: 'Hip Thrust', sets: 3, reps: '8-12' },
  { name: 'Standing Calf Raise', sets: 3, reps: '12-15' },
]
const FULL_A: TemplateLift[] = [
  { name: 'Barbell Back Squat', sets: 3, reps: '5-8' },
  { name: 'Barbell Bench Press', sets: 3, reps: '5-8' },
  { name: 'Pendlay Row', sets: 3, reps: '6-8' },
  { name: 'Plank', sets: 3, reps: '45s' },
]
const FULL_B: TemplateLift[] = [
  { name: 'Barbell Deadlift', sets: 3, reps: '3-5' },
  { name: 'Overhead Press', sets: 3, reps: '6-8' },
  { name: 'Weighted Pull-Ups', sets: 3, reps: '5-8' },
  { name: 'Walking Lunges', sets: 3, reps: '10-12' },
]
const FULL_C: TemplateLift[] = [
  { name: 'Barbell Back Squat', sets: 3, reps: '8-10' },
  { name: 'Incline Dumbbell Press', sets: 3, reps: '8-12' },
  { name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
  { name: 'Lat Pulldown', sets: 3, reps: '10-12' },
]
const STRONG_A: TemplateLift[] = [
  { name: 'Barbell Back Squat', sets: 5, reps: 5 },
  { name: 'Barbell Bench Press', sets: 5, reps: 5 },
  { name: 'Pendlay Row', sets: 5, reps: 5 },
]
const STRONG_B: TemplateLift[] = [
  { name: 'Barbell Back Squat', sets: 5, reps: 5 },
  { name: 'Overhead Press', sets: 5, reps: 5 },
  { name: 'Barbell Deadlift', sets: 1, reps: 5 },
]

const UPPER_MUSCLES = ['chest', 'back', 'shoulders', 'arms']
const LOWER_MUSCLES = ['quads', 'hamstrings', 'glutes', 'core']
const FULL_MUSCLES = ['quads', 'chest', 'back', 'shoulders', 'core']

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'full-body-3',
    name: 'Full body · 3 days',
    summary: 'Three full-body sessions (Mon/Wed/Fri). The most time-efficient way to build strength; great for beginners and busy weeks.',
    daysPerWeek: 3,
    goal: 'general',
    week: {
      Monday: { type: 'Strength', subtype: 'Full body A', lifts: FULL_A, muscles: FULL_MUSCLES },
      Wednesday: { type: 'Strength', subtype: 'Full body B', lifts: FULL_B, muscles: FULL_MUSCLES },
      Friday: { type: 'Strength', subtype: 'Full body C', lifts: FULL_C, muscles: FULL_MUSCLES },
    },
  },
  {
    id: 'upper-lower-4',
    name: 'Upper / lower · 4 days',
    summary: 'Two upper and two lower sessions with heavy and volume days. Balanced hypertrophy and strength for intermediates.',
    daysPerWeek: 4,
    goal: 'strength',
    week: {
      Monday: { type: 'Strength', subtype: 'Upper A (heavy)', lifts: UPPER_A, muscles: UPPER_MUSCLES },
      Tuesday: { type: 'Strength', subtype: 'Lower A (heavy)', lifts: LOWER_A, muscles: LOWER_MUSCLES },
      Thursday: { type: 'Strength', subtype: 'Upper B (volume)', lifts: UPPER_B, muscles: UPPER_MUSCLES },
      Friday: { type: 'Strength', subtype: 'Lower B (volume)', lifts: LOWER_B, muscles: LOWER_MUSCLES },
    },
  },
  {
    id: 'strength-5x5',
    name: '5×5 strength · 3 days',
    summary: 'Classic A/B 5×5 on the big barbell lifts. Add load whenever every set hits 5 — the progression targets do this for you.',
    daysPerWeek: 3,
    goal: 'strength',
    week: {
      Monday: { type: 'Strength', subtype: '5×5 A', lifts: STRONG_A, muscles: FULL_MUSCLES },
      Wednesday: { type: 'Strength', subtype: '5×5 B', lifts: STRONG_B, muscles: FULL_MUSCLES },
      Friday: { type: 'Strength', subtype: '5×5 A', lifts: STRONG_A, muscles: FULL_MUSCLES },
    },
  },
  {
    id: 'hybrid-5',
    name: 'Hybrid · strength + running',
    summary: 'Three strength sessions plus easy, interval and long runs. For hybrid / HYROX-style athletes who want both engines.',
    daysPerWeek: 6,
    goal: 'hybrid',
    week: {
      Monday: { type: 'Strength', subtype: 'Upper', lifts: UPPER_A, muscles: UPPER_MUSCLES },
      Tuesday: { type: 'Conditioning', subtype: 'Easy run', durationMin: 40, notes: 'Zone 2 — conversational pace the whole way.', muscles: ['cardio'] },
      Wednesday: { type: 'Strength', subtype: 'Lower', lifts: LOWER_A, muscles: LOWER_MUSCLES },
      Thursday: { type: 'Conditioning', subtype: 'Intervals', durationMin: 35, notes: '10 min warm-up, 6 × 3 min hard / 2 min easy, cool down.', muscles: ['cardio'] },
      Friday: { type: 'Strength', subtype: 'Full body', lifts: FULL_B, muscles: FULL_MUSCLES },
      Saturday: { type: 'Conditioning', subtype: 'Long run', durationMin: 70, notes: 'Easy, steady and long. Fuel if over an hour.', muscles: ['cardio'] },
    },
  },
]

const ALL_DAYS: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function getTemplate(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((t) => t.id === id)
}

// Monday of the week a template should fill: this week or the next one.
export function templateWeekMonday(today: string, which: 'current' | 'next'): string {
  const monday = mondayOf(today)
  return which === 'next' ? addDays(monday, 7) : monday
}

export interface WeightPlan {
  weight: number | null
  note: string | null
}

// Starting weight per lift: the progression engine's next target when there
// is history, otherwise the last weight used, otherwise blank.
export function weightPlanner(history: Session[]): (liftName: string) => WeightPlan {
  const suggestions = suggestionsFromSessions(history)
  const lastWeight = new Map<string, number>()
  for (const s of liftSetsFromSessions(history)) {
    if (!s.excluded) lastWeight.set(s.key, s.weight)
  }
  return (liftName) => {
    const key = nameToKey(liftName)
    const suggestion = suggestions.get(key)
    if (suggestion) return { weight: suggestion.targetWeight, note: suggestion.reason }
    const last = lastWeight.get(key)
    if (last != null) return { weight: last, note: `Last used ${last} kg.` }
    return { weight: null, note: 'New lift — pick a weight you could do for a couple more reps than planned.' }
  }
}

export function buildTemplateWeek(
  template: PlanTemplate,
  monday: string,
  athlete: WeekDoc['athlete'],
  history: Session[],
): WeekDoc {
  const planWeight = weightPlanner(history)
  const sessions: Session[] = ALL_DAYS.map((day, i) => {
    const date = addDays(monday, i)
    const t = template.week[day]
    if (!t) {
      return { date, day, type: 'Rest', subtype: null, exercises: [], status: 'planned', photos: [], muscle_groups: [], notes: '' } as Session
    }
    const exercises: Exercise[] = (t.lifts ?? []).map((lift) => {
      const { weight, note } = planWeight(lift.name)
      return {
        name: lift.name,
        sets: lift.sets,
        reps: lift.reps,
        weight_kg: weight,
        notes: note,
        alternatives: [],
      }
    })
    return {
      date,
      day,
      type: t.type,
      subtype: t.subtype,
      exercises,
      duration_min: t.durationMin ?? null,
      notes: t.notes ?? '',
      status: 'planned',
      photos: [],
      muscle_groups: t.muscles,
      reasoning: `${template.name} template. Weights are your next progression targets where you have history.`,
    } as Session
  })

  return {
    week: weekLabel(monday),
    athlete,
    sessions,
    week_summary: { total_sessions: 0, high_output_days: 0, strength_days: 0, recovery_days: 0, total_calories: 0, notes: '' },
    lift_progression: {},
    health_flags: [],
    next_week_plan: {},
    garmin_recovery: {},
    renpho_measurements: {},
    daily_readiness: {},
    daily_scores: {},
  } as unknown as WeekDoc
}
