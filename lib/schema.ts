import { z } from 'zod'

// Session status
export const SessionStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'skipped'])

export const SetEntrySchema = z.object({
  reps: z.number(),
  weight_kg: z.number().nullable(),
  effort: z.enum(['easy', 'perfect', 'hard']).nullable(),
  completed_at: z.string(),
  side: z.enum(['left', 'right']).nullable().optional(),
})

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
  effort: z.enum(['easy', 'perfect', 'hard']).nullable().optional(),
  actual_note: z.string().nullable().optional(),
  set_log: z.array(SetEntrySchema).optional(),
  per_side: z.boolean().optional(),
  alternatives: z.array(z.object({
    name: z.string(),
    sets: z.number().nullable().optional(),
    reps: z.union([z.number(), z.string()]).nullable().optional(),
    weight_kg: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).default([]),
})

// Exercise group (optional structured alternative to flat exercises array)
export const ExerciseGroupSchema = z.object({
  group_id: z.string(),
  label: z.string(),
  type: z.enum(['warmup', 'straight', 'superset', 'cooldown']),
  rest_between_sets_sec: z.number().optional(),
  rest_between_exercises_sec: z.number().optional(),
  exercises: z.array(ExerciseSchema).default([]),
})

// Individual session
export const SessionSchema = z.object({
  date: z.string(), // ISO date string YYYY-MM-DD
  day: z.string(),  // "Monday", "Tuesday", etc.
  type: z.string(), // "Strength", "Conditioning", "Recovery", "Rest"
  subtype: z.string().nullable().optional(),
  exercises: z.array(ExerciseSchema).default([]),
  exercise_groups: z.array(ExerciseGroupSchema).optional(),
  duration_min: z.number().nullable().optional(),
  avg_hr_bpm: z.number().nullable().optional(),
  total_calories: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: SessionStatusSchema.default('planned'),
  photos: z.array(z.string()).default([]),
  garmin_activity_id: z.number().nullable().optional(),
  source: z.enum(['garmin', 'manual']).nullable().optional(),
  aerobic_training_effect: z.number().nullable().optional(),
  anaerobic_training_effect: z.number().nullable().optional(),
  training_stress_score: z.number().nullable().optional(),
  hr_zones: z.array(z.object({
    zone_name: z.string(),
    secs_in_zone: z.number(),
    zone_high_boundary: z.number(),
  })).nullable().optional(),
  muscle_groups: z.array(z.string()).default([]),
  rpe: z.number().min(1).max(10).nullable().optional(),
  reasoning: z.string().nullable().optional(),
  garmin_workout_id: z.number().nullable().optional(),
  garmin_pushed_exercise_order: z.array(z.object({
    name: z.string(),
    sets: z.number(),
    // Optional: sessions pushed before this field was added only have name/sets.
    garminCategory: z.string().optional(),
    garminExerciseName: z.string().optional(),
  })).nullable().optional(),
  garmin_push_skipped: z.array(z.string()).optional(),
  garmin_pull_status: z.enum(['not_pushed', 'pushed', 'pulled']).optional(),
})

// Mapping from an app exercise name to Garmin's structured-workout catalog entry
export const GarminExerciseMapEntrySchema = z.object({
  _id: z.string(), // normalized exercise name (lowercase, trimmed)
  displayName: z.string(),
  garminCategory: z.string(), // e.g. "BENCH_PRESS"
  garminExerciseName: z.string(), // e.g. "BARBELL_BENCH_PRESS"
  confidence: z.enum(['high', 'low']),
  source: z.enum(['bootstrap', 'mcp_claude']),
  updatedAt: z.string(),
})

export const NutritionLogEntrySchema = z.object({
  _id: z.string(), // date this estimate is for, YYYY-MM-DD
  estimatedCalories: z.number(),
  macros: z.object({
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
  }).nullable().optional(), // nullable: legacy docs may have stored null instead of omitting the key
  description: z.string(),
  analyzedAt: z.string(), // ISO timestamp of when this estimate was saved
})

// Freeform note about what was eaten on a given day, typed directly in the app
// (as an alternative to photographing everything). Surfaced to Claude alongside
// any food photos for the same date via list_food_photos_for_range.
export const FoodNoteSchema = z.object({
  _id: z.string(), // date this note is for, YYYY-MM-DD
  text: z.string(),
  updatedAt: z.string(), // ISO timestamp of last save
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
  body_battery_charged: z.number().nullable().optional(),
  body_battery_drained: z.number().nullable().optional(),
  avg_stress_level: z.number().nullable().optional(),
  max_stress_level: z.number().nullable().optional(),
  vo2max: z.number().nullable().optional(),
  fitness_age: z.number().nullable().optional(),
  achievable_fitness_age: z.number().nullable().optional(),
  fetched_at: z.string().optional(),
})

// Daily subjective check-in
export const DailyReadinessSchema = z.object({
  date: z.string(),             // YYYY-MM-DD
  energy_level: z.number().min(1).max(5),
  sleep_quality: z.number().min(1).max(5),
  mood: z.number().min(1).max(5),
  logged_at: z.string(),        // ISO timestamp
})
export type DailyReadiness = z.infer<typeof DailyReadinessSchema>

export const RecoveryScoreBreakdownSchema = z.object({
  total: z.number(),
  sleep: z.number(),
  rhr: z.number(),
  load: z.number(),
  subjective: z.number(),
  label: z.enum(['Ready', 'Moderate', 'Rest']),
  color: z.enum(['green', 'amber', 'red']),
})
export type RecoveryScoreBreakdown = z.infer<typeof RecoveryScoreBreakdownSchema>

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
  daily_readiness: z.record(z.string(), DailyReadinessSchema).default({}),
  daily_scores: z.record(z.string(), RecoveryScoreBreakdownSchema).default({}),
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

// Automation notes consumed by scheduled jobs
export const AutomationNotesSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw
  const obj = raw as Record<string, unknown>

  const explicitConstraints = typeof obj.constraints === 'string' ? obj.constraints : ''
  const explicitPriorities = typeof obj.priorities_context === 'string' ? obj.priorities_context : ''
  if (explicitConstraints || explicitPriorities) {
    return {
      constraints: explicitConstraints,
      priorities_context: explicitPriorities,
      updated_at: typeof obj.updated_at === 'string' ? obj.updated_at : null,
    }
  }

  const legacyConstraints = [
    typeof obj.travel_window === 'string' ? obj.travel_window : '',
    typeof obj.temporary_constraints === 'string' ? obj.temporary_constraints : '',
    typeof obj.flag_overrides === 'string' ? obj.flag_overrides : '',
  ].filter((v) => v.trim().length > 0)

  const legacyPriorities = [
    typeof obj.priority_rules === 'string' ? obj.priority_rules : '',
    typeof obj.freeform_notes === 'string' ? obj.freeform_notes : '',
  ].filter((v) => v.trim().length > 0)

  return {
    constraints: legacyConstraints.join('\n\n'),
    priorities_context: legacyPriorities.join('\n\n'),
    updated_at: typeof obj.updated_at === 'string' ? obj.updated_at : null,
  }
}, z.object({
  constraints: z.string().default(''),
  priorities_context: z.string().default(''),
  updated_at: z.string().nullable().default(null),
}))

export const ProposedPlanRunTypeSchema = z.enum(['manual', 'daily', 'weekly'])

export const ProposedPlanSchema = z.object({
  created_at: z.string(),
  source: z.string().default('manual'),
  run_type: ProposedPlanRunTypeSchema.default('manual'),
  notes_version: z.string().nullable().default(null),
  analysis_text: z.string().nullable().default(null),
  raw_json: z.string(),
  week_doc: WeekDocSchema,
})

// Export types
export type GarminExerciseMapEntry = z.infer<typeof GarminExerciseMapEntrySchema>
export type NutritionLogEntry = z.infer<typeof NutritionLogEntrySchema>
export type FoodNote = z.infer<typeof FoodNoteSchema>
export type SetEntry = z.infer<typeof SetEntrySchema>
export type Exercise = z.infer<typeof ExerciseSchema>
export type ExerciseGroup = z.infer<typeof ExerciseGroupSchema>
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
export type AutomationNotes = z.infer<typeof AutomationNotesSchema>
export type ProposedPlanRunType = z.infer<typeof ProposedPlanRunTypeSchema>
export type ProposedPlan = z.infer<typeof ProposedPlanSchema>
