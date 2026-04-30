# Exercise Groups Design

**Date:** 2026-04-30

## Problem

The current flat `exercises` array on a session has no structure — warm-up, main lifts, supersets, and cool-down are all mixed together. This makes it hard to display rest times, communicate group intent (superset vs straight sets), and give the UI enough context to render sessions meaningfully.

## Approach

Add an optional `exercise_groups` field to the session schema alongside the existing flat `exercises` array. When present, `exercise_groups` is the source of truth for display and logging. The flat `exercises` array is derived from groups on save (flatten all group exercise arrays) and continues to serve progression tracking, export, DayCard, and all other consumers unchanged.

Old sessions (flat `exercises` only) continue to work exactly as today. No migration.

## Schema

```ts
ExerciseGroupSchema = {
  group_id: string                          // unique within session: "warmup", "A", "B", "cooldown"
  label: string                             // "A — Main Lift", "B — Superset", etc.
  type: 'warmup' | 'straight' | 'superset' | 'cooldown'
  rest_between_sets_sec: number             // required on all groups
  rest_between_exercises_sec?: number       // superset groups only
  exercises: ExerciseSchema[]
}

SessionSchema.exercise_groups = ExerciseGroupSchema[] (optional)
```

`ExerciseSchema` is unchanged.

## Save logic

In the log page `buildPayload`, when `session.exercise_groups` exists:
- Derive `exercises` by flattening all groups' exercise arrays (with actuals merged in)
- Write `exercise_groups` back to the session with actuals merged into each group's exercises
- Both fields are persisted to disk

## UI — log page

When `session.exercise_groups` is present, render the exercise table with group section headers instead of the flat list. Each group header shows:
- Label
- Type badge (color-coded: warmup=amber, straight=violet, superset=sky, cooldown=emerald)
- Rest time (e.g. "180s rest")

Exercises inside each group use the identical row/effort/note UI as the current flat list. When no groups exist, render exactly as today.

## UI — DayCard

No change. Continues reading `session.exercises` (flat).

## Other consumers

`LiftProgressChart`, progression tracking, export, import — all continue reading `session.exercises`. No changes needed.

## AI instructions

Claude is instructed to output `exercise_groups` instead of a flat `exercises` array for all Strength (and non-class Conditioning) sessions. Required fields per group: `group_id`, `label`, `type`, `rest_between_sets_sec`. Supersets also require `rest_between_exercises_sec: 0`. Every session must include a `warmup` group and a `cooldown` group.
