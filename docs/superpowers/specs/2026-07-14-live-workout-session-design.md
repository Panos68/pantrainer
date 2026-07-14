# Live Workout Session (per-set logging + rest timer)

## Problem

Today's workout logging (`app/log/[day]/page.tsx`) is a planned-vs-actual table: one row per exercise, aggregate values only (`actual_sets`, `actual_reps`, `actual_weight_kg`, `effort`, `actual_note`). There is no per-set granularity and no rest timer — `rest_between_sets_sec` / `rest_between_exercises_sec` are shown as static text only.

Some sessions are logged live at the gym (set by set); others are logged after the fact from a photo of a handwritten log, parsed by AI into the same aggregate fields. Both paths must keep working — this design only adds a new *optional* live path, it does not replace or gate the existing one.

## Goals

- A full-screen, one-exercise-at-a-time live logging flow with a rest timer between sets.
- Per-set weight/reps/effort capture, with effort defaulting to "Perfect" to minimize taps.
- Correct handling of supersets: cycle exercises within a round instead of finishing one exercise before starting the next.
- Photo/AI-import path and the existing table view are unchanged and keep working exactly as today.
- Per-exercise note stays (not per-set) — captured once after an exercise's sets are done.
- No persistent "logging mode" preference/toggle. The live flow is entered via an explicit "Start Live Session" action on days the user wants it; other days, table/photo logging is used as before.
- Alternative-exercise swapping (already available in the table view) also works in the live view, using the same `alternatives` data.

## Non-goals

- No live adjustment of "next session's proposed weight" mid-workout. Per-set effort still feeds the existing end-of-week/next-session progression calc (via a derived effort), unchanged in its own logic.
- No changes to the photo/AI-import pipeline or its data fields.
- No changes to exercise demo gif/video sourcing or matching in this design. Today's demo lookup (`components/ExerciseDemo.tsx` + `app/api/exercise-demo/route.ts`) fuzzy-matches against a third-party API and is unreliable; improving or replacing that media source is a separate follow-up project (research into alternative exercise-media data sources), tracked independently of this spec.

## Data model changes

In `lib/schema.ts`, add an optional field to `ExerciseSchema`:

```ts
sets: z.array(z.object({
  reps: z.number(),
  weight_kg: z.number().nullable(),
  effort: z.enum(['easy', 'perfect', 'hard']),
  completed_at: z.string(), // ISO timestamp
})).optional(),
```

- When `sets` is present (i.e., this exercise was logged via the live flow), the table view derives `actual_sets` (= `sets.length`), `actual_reps`/`actual_weight_kg` (e.g. mode/last value, matching current display conventions), and `effort` (worst-case across the set entries: hard > easy > perfect) for display and for the progression calc — so no other code needs to know about per-set data.
- When `sets` is absent, everything works exactly as today (photo-import / manual table edits only touch the aggregate fields).
- `actual_note` remains the single per-exercise note field, settable from both the table and the live flow.

## Live session flow

Entry point: a "Start Live Session" button on `app/log/[day]/page.tsx`, visible whenever the session has planned exercises. Tapping it opens a new full-screen route/view (e.g. `app/log/[day]/live/page.tsx`) seeded from the current session's plan.

**Traversal model:**
- The session's exercises are walked in order, using `exercise_groups` when present (matching today's grouping: warmup/straight/superset/cooldown).
- For a `straight` exercise: finish all of its planned sets before advancing.
- For a `superset` group: walk in **rounds** — one set of each exercise in the group, in order, per round, for as many rounds as the group's planned sets. Only after every exercise's set in a round is logged does the group advance to the next round.

**Per-set screen:**
- Shows exercise name (and, mid-superset, "Round X of Y — next: <exercise>" context), target reps/weight prefilled and editable, current set number.
- Logging a set: confirm reps/weight, tap effort (Perfect/Easy/Hard, default Perfect) → set is recorded with `completed_at` = now.

**Rest screen (auto-starts after logging a set):**
- Straight exercise, mid-sets: countdown = `rest_between_sets_sec` from the exercise's group (or a sane default if absent).
- Superset, between exercises within a round: countdown = `rest_between_exercises_sec`.
- Superset, after a round's last exercise: countdown = `rest_between_sets_sec`.
- Countdown screen shows time remaining, +30s / skip controls, and a preview of the next set/exercise.
- Last set overall: no rest screen — go straight to the note step.

**Note step:**
- After an exercise's sets are all logged, a single note field (prefilled with any existing `actual_note`), then advance to the next exercise/group.

**Exit / partial sessions:**
- Exiting the live view at any point saves whatever sets have been logged so far (each set write is persisted immediately via the existing PATCH endpoint, not batched to the end) and returns to the table view, where already-logged exercises show their derived aggregate values and can still be edited manually.
- Re-entering "Start Live Session" resumes at the first exercise/group with an incomplete set count.

**Alternative-exercise swap:**
- Before starting an exercise's (or a superset round's) first set, the per-set screen shows a "⇄" control identical in purpose to the table view's swap menu, listing the original exercise plus its `alternatives`.
- Swapping re-seeds the live screen's target reps/weight from the chosen alternative (same `planToActualPreset` logic used by the table view) and writes the same `swappedExercises`-equivalent state so the table view reflects the swap afterward.
- Once the first set of an exercise is logged, the swap control is hidden for that exercise/round — matches the table view's implicit assumption that a swap decision is made before logging, avoiding mixed-exercise set data.

## Edge cases

- **Skipping a set:** a "skip set" action marks it absent (no `sets` entry added) and moves on; the exercise's `actual_sets` will simply reflect fewer completed sets than planned.
- **Editing after the fact:** the table view's existing inline edit inputs remain available and directly edit the aggregate fields — editing there on an exercise that has `sets` data will overwrite the derived aggregates and effectively detach it from the per-set data (acceptable; matches "table is always the source of truth for review/edit" principle).
- **Mixed sessions:** a session can have some exercises logged live and others filled from a photo later (or vice versa) — no conflict, since each exercise's `sets` field is independent.

## Testing

- Unit tests for the round-traversal logic (superset ordering, rest-duration selection) and for aggregate derivation from `sets`.
- Manual verification: run a live session end-to-end (straight sets + a superset group), confirm table view reflects it correctly afterward, confirm photo-import still writes/displays as before.

## Rollout

All work happens on branch `feature/live-workout-session` (already created), to be tested independently before merging to `master`.
