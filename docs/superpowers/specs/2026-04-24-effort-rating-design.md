# Design: Per-Exercise Effort Rating

**Date:** 2026-04-24
**Status:** Approved

## Summary

Add a three-option effort rating (Easy / Perfect / Hard) to each strength exercise in the log view. Ratings persist to the session JSON and surface in the export to Claude, closing the feedback loop between perceived exertion and AI-generated training plans.

## Motivation

The export currently carries *what* was done (sets, reps, weight) but not *how it felt*. Claude plans the next week without knowing whether last week's loads were too easy, too hard, or just right. Effort ratings fix this at the source.

## Scope

- Strength exercises only (non-strength sessions have no exercise cards)
- One rating per exercise (not per set)
- Rating is optional — unrated exercises are valid

## Out of Scope

- RPE numeric scale
- Per-set ratings
- End-of-session rating summary screen
- Historical effort trend display (can be added later)

---

## 1. Data Model

Add one optional field to `ExerciseSchema` in `lib/schema.ts`:

```ts
effort: z.enum(['easy', 'perfect', 'hard']).nullable().optional()
```

No other schema changes. Existing sessions without ratings remain valid.

---

## 2. UI — Exercise Card (`app/log/[day]/page.tsx`)

The log page tracks exercise actuals in a local `exerciseActuals` state array. Add `effort` to that state type:

```ts
type ExerciseActual = {
  sets: string
  reps: string
  weight_kg: string
  effort: 'easy' | 'perfect' | 'hard' | null
}
```

**Placement:** Below the sets / reps / weight inputs on each Strength exercise card, a row of three buttons:

```
[ Easy ]  [ Perfect ]  [ Hard ]
```

**Visual states:**
- Unselected: neutral/muted (matches existing card style)
- Easy selected: green
- Perfect selected: blue  
- Hard selected: red or amber

**Interaction:** Tapping a selected button deselects it (toggles off). Only one option active at a time per exercise.

**Persistence:** `effort` is included in the save payload alongside `actual_sets`, `actual_reps`, `actual_weight_kg`.

---

## 3. Export

### Basic export (`ExportPayload`)

`sessions` already passes through as `WeekDoc['sessions']`, so `effort` is automatically included once it's in the schema. No changes to export code needed.

### Coach context export (`ExportPayloadV2`)

Add an `effort_summary` to the `lift_summary` section of `CoachContext`:

```ts
effort_summary: {
  easy: number     // count of exercises rated easy across the week
  perfect: number
  hard: number
}
```

Computed by iterating completed strength sessions and counting non-null effort values. Gives Claude a quick intensity-perception signal without parsing every exercise.

---

## Implementation Touch Points

| File | Change |
|------|--------|
| `lib/schema.ts` | Add `effort` field to `ExerciseSchema` |
| `app/log/[day]/page.tsx` | Add `effort` to `ExerciseActual` type, initialize from session data, render buttons, include in save |
| `lib/export.ts` | Add `effort_summary` computation and field to `CoachContext` / `ExportPayloadV2` |
