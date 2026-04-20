import { z } from 'zod'

// Session status
export const SessionStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'skipped'])

// Planned exercise within a session
export const ExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().nullable().optional(),
  reps: z.union([z.number(), z.string()]).nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  actual_sets: z.number().nullable().optional(),
  actual_reps: z.union([z.number(), z.string()]).nullable().optional(),
  actual_weight_kg: z.number().nullable().optional(),
})

// Individual session
export const SessionSchema = z.object({
  date: z.string(), // ISO date string YYYY-MM-DD
  day: z.string(),  // "Monday", "Tuesday", etc.
  type: z.string(), // "Strength", "Conditioning", "Recovery", "Rest"
  subtype: z.string().nullable().optional(),
  exercises: z.array(ExerciseSchema).default([]),
  duration_min: z.number().nullable().optional(),
  avg_hr_bpm: z.number().nullable().optional(),
  total_calories: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: SessionStatusSchema.default('planned'),
  photos: z.array(z.string()).default([]),
  garmin_activity_id: z.number().nullable().optional(),
  source: z.enum(['garmin', 'manual']).optional(),
})

// Week summary
export const WeekSummarySchema = z.object({
  total_sessions: z.number().default(0),
  high_output_days: z.number().default(0),
  strength_days: z.number().default(0),
  recovery_days: z.number().default(0),
  total_calories: z.number().default(0),
  notes: z.string().optional(),
})

// Lift progression — flexible key-value with string or number values
export const LiftProgressionSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))

// Garmin recovery data for a single day
export const GarminRecoveryDaySchema = z.object({
  sleep_hours: z.number().nullable().optional(),
  deep_sleep_hours: z.number().nullable().optional(),
  rem_sleep_hours: z.number().nullable().optional(),
  resting_hr_bpm: z.number().nullable().optional(),
  max_hr_bpm: z.number().nullable().optional(),
  fetched_at: z.string().optional(),
})

// Health flag
export const HealthFlagSchema = z.object({
  flag: z.string(),
  location: z.string().optional(),
  status: z.string(),
  training_impact: z.string().optional(),
  action: z.string().optional(),
  cleared: z.boolean().default(false),
})

// Next week plan
export const NextWeekPlanSchema = z.object({
  monday: z.string().optional(),
  tuesday: z.string().optional(),
  wednesday: z.string().optional(),
  thursday: z.string().optional(),
  friday: z.string().optional(),
  saturday: z.string().optional(),
  sunday: z.string().optional(),
  notes: z.string().optional(),
})

// Full week document
export const WeekDocSchema = z.object({
  week: z.string(), // "Apr 14–20, 2026"
  athlete: z.object({
    name: z.string(),
    age: z.number(),
    weight_kg: z.number(),
    smm_kg: z.number(),
    bf_pct: z.number(),
    bmr_kcal: z.number(),
    rhr_bpm: z.number(),
    smm_target_kg: z.number(),
  }),
  sessions: z.array(SessionSchema).default([]),
  week_summary: WeekSummarySchema.default({
    total_sessions: 0,
    high_output_days: 0,
    strength_days: 0,
    recovery_days: 0,
    total_calories: 0,
  }),
  lift_progression: LiftProgressionSchema.default({}),
  health_flags: z.array(HealthFlagSchema).default([]),
  next_week_plan: NextWeekPlanSchema.default({}),
  garmin_recovery: z.record(z.string(), GarminRecoveryDaySchema).default({}),
})

// Athlete profile (stored separately in data/athlete.json)
export const AthleteProfileSchema = z.object({
  name: z.string(),
  age: z.number(),
  weight_kg: z.number(),
  smm_kg: z.number(),
  bf_pct: z.number(),
  bmr_kcal: z.number(),
  rhr_bpm: z.number(),        // baseline RHR
  smm_target_kg: z.number(),
})

// App state (stored in data/state.json)
export const AppStateSchema = z.object({
  gymWeek: z.enum(['week_a', 'week_b', 'legs_week']).default('week_a'),
  deloadCounter: z.number().default(1),
  lastDeloadWeek: z.string().nullable().default(null),
  isDeloadWeek: z.boolean().default(false),
})

// Export types
export type Exercise = z.infer<typeof ExerciseSchema>
export type Session = z.infer<typeof SessionSchema>
export type SessionStatus = z.infer<typeof SessionStatusSchema>
export type WeekSummary = z.infer<typeof WeekSummarySchema>
export type LiftProgression = z.infer<typeof LiftProgressionSchema>
export type GarminRecoveryDay = z.infer<typeof GarminRecoveryDaySchema>
export type HealthFlag = z.infer<typeof HealthFlagSchema>
export type NextWeekPlan = z.infer<typeof NextWeekPlanSchema>
export type WeekDoc = z.infer<typeof WeekDocSchema>
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>
export type AppState = z.infer<typeof AppStateSchema>
