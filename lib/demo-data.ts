import type { AthleteProfile, Exercise, GarminRecoveryDay, RenphoMeasurementDay, Session, SetEntry, WeekDoc } from './schema'
import { mondayOf, weekLabel } from './history-import'

// Deterministic fake training history for demo instances and screenshots: a
// 3-day strength split with progressive overload (and the occasional missed
// rep / stall, so the progression engine has something to explain), runs,
// Garmin-style recovery and scale weigh-ins. No real person's data.

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const DEMO_PROFILE: AthleteProfile = {
  name: 'Demo Athlete',
  age: 34,
  weight_kg: 81,
  smm_kg: 37,
  bf_pct: 17,
  bmr_kcal: 1780,
  rhr_bpm: 52,
  smm_target_kg: 39,
}

interface LiftPlan {
  name: string
  start: number
  step: number // added every other week
  sets: number
  reps: number
  muscles: string[]
}

const UPPER: LiftPlan[] = [
  { name: 'Barbell Bench Press', start: 70, step: 2.5, sets: 4, reps: 5, muscles: ['chest', 'triceps'] },
  { name: 'Pendlay Row', start: 55, step: 2.5, sets: 4, reps: 6, muscles: ['back', 'biceps'] },
  { name: 'Push Press', start: 45, step: 2.5, sets: 3, reps: 5, muscles: ['shoulders'] },
  { name: 'Weighted Pull-Ups', start: 5, step: 2.5, sets: 3, reps: 5, muscles: ['back', 'biceps'] },
]
const LOWER: LiftPlan[] = [
  { name: 'Barbell Back Squat', start: 90, step: 5, sets: 4, reps: 5, muscles: ['quads', 'glutes'] },
  { name: 'Romanian Deadlift', start: 70, step: 5, sets: 3, reps: 8, muscles: ['hamstrings', 'glutes'] },
  { name: 'Walking Lunges', start: 16, step: 2, sets: 3, reps: 10, muscles: ['quads', 'glutes'] },
]
const FULL: LiftPlan[] = [
  { name: 'Barbell Deadlift', start: 120, step: 5, sets: 3, reps: 5, muscles: ['back', 'hamstrings', 'glutes'] },
  { name: 'Incline Dumbbell Press', start: 24, step: 2, sets: 3, reps: 10, muscles: ['chest', 'shoulders'] },
  { name: 'Chest-Supported DB Row', start: 22, step: 2, sets: 3, reps: 10, muscles: ['back'] },
]

function strengthSession(date: string, day: string, subtype: string, lifts: LiftPlan[], weekIndex: number, rand: () => number, completed: boolean): Session {
  const exercises: Exercise[] = lifts.map((lift) => {
    const weight = lift.start + Math.floor(weekIndex / 2) * lift.step
    const setLog: SetEntry[] = []
    if (completed) {
      for (let i = 0; i < lift.sets; i++) {
        // ~1 in 6 final sets falls a rep short, so stalls and "repeat" advice appear.
        const missed = i === lift.sets - 1 && rand() < 0.17
        setLog.push({
          reps: missed ? lift.reps - 1 : lift.reps,
          weight_kg: weight,
          effort: i === lift.sets - 1 ? (missed ? 'hard' : rand() < 0.5 ? 'perfect' : 'easy') : 'perfect',
          completed_at: `${date}T07:${String(10 + i * 4).padStart(2, '0')}:00.000Z`,
        })
      }
    }
    return {
      name: lift.name,
      sets: lift.sets,
      reps: lift.reps,
      weight_kg: weight,
      actual_sets: completed ? lift.sets : null,
      actual_reps: completed ? lift.reps : null,
      actual_weight_kg: completed ? weight : null,
      effort: completed ? 'perfect' : null,
      set_log: setLog,
      alternatives: [],
    }
  })
  return {
    date,
    day,
    type: 'Strength',
    subtype,
    exercises,
    duration_min: completed ? 55 + Math.round(rand() * 15) : null,
    avg_hr_bpm: completed ? 112 + Math.round(rand() * 12) : null,
    total_calories: completed ? 380 + Math.round(rand() * 120) : null,
    status: completed ? 'completed' : 'planned',
    photos: [],
    muscle_groups: [...new Set(lifts.flatMap((l) => l.muscles))],
    rpe: completed ? 7 + Math.round(rand() * 2) : null,
  } as Session
}

function runSession(date: string, day: string, subtype: string, minutes: number, rand: () => number, completed: boolean): Session {
  return {
    date,
    day,
    type: 'Conditioning',
    subtype,
    exercises: [],
    duration_min: completed ? minutes + Math.round(rand() * 6 - 3) : minutes,
    avg_hr_bpm: completed ? 142 + Math.round(rand() * 14) : null,
    total_calories: completed ? Math.round(minutes * 11.5) : null,
    status: completed ? 'completed' : 'planned',
    photos: [],
    muscle_groups: ['cardio'],
    aerobic_training_effect: completed ? Math.round((2.6 + rand() * 1.4) * 10) / 10 : null,
    rpe: completed ? 5 + Math.round(rand() * 3) : null,
  } as Session
}

function restSession(date: string, day: string): Session {
  return { date, day, type: 'Rest', exercises: [], status: 'planned', photos: [], muscle_groups: [] } as Session
}

function recoveryDay(rand: () => number, fetchedAt: string): GarminRecoveryDay {
  const sleep = Math.round((6.4 + rand() * 1.8) * 10) / 10
  return {
    sleep_hours: sleep,
    deep_sleep_hours: Math.round(sleep * 0.18 * 10) / 10,
    rem_sleep_hours: Math.round(sleep * 0.22 * 10) / 10,
    resting_hr_bpm: 49 + Math.round(rand() * 6),
    max_hr_bpm: 150 + Math.round(rand() * 30),
    body_battery_charged: 55 + Math.round(rand() * 35),
    body_battery_drained: 50 + Math.round(rand() * 35),
    avg_stress_level: 22 + Math.round(rand() * 18),
    hrv_overnight_ms: 58 + Math.round(rand() * 18),
    sleep_score: 68 + Math.round(rand() * 22),
    total_kilocalories: 2350 + Math.round(rand() * 500),
    fetched_at: fetchedAt,
  }
}

function weekDoc(monday: string, sessions: Session[], recovery: Record<string, GarminRecoveryDay>, weights: Record<string, RenphoMeasurementDay>): WeekDoc {
  const completed = sessions.filter((s) => s.status === 'completed')
  return {
    week: weekLabel(monday),
    athlete: DEMO_PROFILE,
    sessions,
    week_summary: {
      total_sessions: completed.length,
      high_output_days: completed.filter((s) => s.type === 'Conditioning').length,
      strength_days: completed.filter((s) => s.type === 'Strength').length,
      recovery_days: 0,
      total_calories: completed.reduce((sum, s) => sum + (s.total_calories ?? 0), 0),
      notes: '',
    },
    lift_progression: {},
    health_flags: [],
    next_week_plan: {},
    garmin_recovery: recovery,
    renpho_measurements: weights,
    daily_readiness: {},
    daily_scores: {},
  } as unknown as WeekDoc
}

export interface DemoData {
  profile: AthleteProfile
  archived: Array<{ id: string; week: WeekDoc }>
  current: WeekDoc
}

export function generateDemoData(today: string, weeks = 12, seed = 42): DemoData {
  const rand = mulberry32(seed)
  const currentMonday = mondayOf(today)
  const firstMonday = addDays(currentMonday, -7 * weeks)
  const archived: DemoData['archived'] = []
  let current: WeekDoc | null = null

  for (let w = 0; w <= weeks; w++) {
    const monday = addDays(firstMonday, w * 7)
    const sessions: Session[] = []
    const recovery: Record<string, GarminRecoveryDay> = {}
    const weights: Record<string, RenphoMeasurementDay> = {}
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d)
      const day = DAY_NAMES[d]
      const done = date < today
      if (d === 0) sessions.push(strengthSession(date, day, 'Upper', UPPER, w, rand, done))
      else if (d === 1) sessions.push(runSession(date, day, 'Easy run', 40, rand, done))
      else if (d === 2) sessions.push(strengthSession(date, day, 'Lower', LOWER, w, rand, done))
      else if (d === 3) sessions.push(runSession(date, day, 'Intervals', 35, rand, done))
      else if (d === 4) sessions.push(strengthSession(date, day, 'Full body', FULL, w, rand, done))
      else if (d === 5) sessions.push(runSession(date, day, 'Long run', 70, rand, done))
      else sessions.push(restSession(date, day))
      if (date < today) {
        recovery[date] = recoveryDay(rand, `${addDays(date, 1)}T08:00:00.000Z`)
        if (d % 2 === 0) {
          const progress = (w * 7 + d) / (weeks * 7)
          weights[date] = {
            weight_kg: Math.round((82.4 - progress * 2.2 + (rand() - 0.5) * 0.6) * 10) / 10,
            body_fat_pct: Math.round((18.2 - progress * 1.4) * 10) / 10,
            muscle_kg: Math.round((36.8 + progress * 0.6) * 10) / 10,
            fetched_at: `${date}T07:00:00.000Z`,
          }
        }
      }
    }
    const doc = weekDoc(monday, sessions, recovery, weights)
    if (monday === currentMonday) current = doc
    else archived.push({ id: `archive-demo-${monday}`, week: doc })
  }

  return { profile: DEMO_PROFILE, archived, current: current as WeekDoc }
}
