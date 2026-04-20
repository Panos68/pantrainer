# Multi-Activity Day Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Garmin returns multiple activities for the same day, show the user a picker to select the primary activity and auto-append the others as a note block.

**Architecture:** The sync API route already fetches all activities for a date and picks the best one silently. We extend it to return all activities when there are multiple, the log page detects this and shows a compact inline picker above the form, the user selects primary (pre-selected to the current best match), and secondary activities are appended to notes as a summary line. No schema changes needed — secondary activities land in the existing `notes` field.

**Tech Stack:** Next.js App Router, React state, TypeScript, existing `app/api/garmin/sync/route.ts`, `app/log/[day]/page.tsx`

---

## File Map

- Modify: `app/api/garmin/sync/route.ts` — return all activities + best match index when multiple found
- Modify: `app/log/[day]/page.tsx` — show activity picker when multiple activities returned, append secondaries to notes

---

### Task 1: Extend sync route to return all activities

**Files:**
- Modify: `app/api/garmin/sync/route.ts`

The route currently returns only the best match. When multiple activities exist for the day, return all of them so the client can show a picker. `best` stays as the pre-selected recommendation.

- [ ] **Step 1: Update the response shape**

Replace the existing `return Response.json({ matched: true, ... })` block in `app/api/garmin/sync/route.ts` with:

```typescript
    const detail = await fetchActivityDetail(best.activityId)
    const others = activities.filter((a) => a.activityId !== best.activityId)

    return Response.json({
      matched: true,
      garmin_activity_id: best.activityId,
      duration_min: best.duration ? Math.round(best.duration / 60) : null,
      avg_hr_bpm: best.averageHR ? Math.round(best.averageHR) : null,
      total_calories: best.calories ? Math.round(best.calories) : null,
      activity_name: best.activityName,
      activity_type: best.activityType?.typeKey,
      aerobic_training_effect: best.aerobicTrainingEffect ?? null,
      anaerobic_training_effect: best.anaerobicTrainingEffect ?? null,
      training_stress_score: best.trainingStressScore ?? null,
      hr_zones: detail.hrZones,
      // All activities for the day — present only when >1
      all_activities: activities.length > 1
        ? activities.map((a) => ({
            garmin_activity_id: a.activityId,
            activity_name: a.activityName,
            activity_type: a.activityType?.typeKey,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            total_calories: a.calories ? Math.round(a.calories) : null,
            aerobic_training_effect: a.aerobicTrainingEffect ?? null,
            anaerobic_training_effect: a.anaerobicTrainingEffect ?? null,
            training_stress_score: a.trainingStressScore ?? null,
          }))
        : undefined,
    })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add app/api/garmin/sync/route.ts
git commit -m "feat: return all activities in sync route when multiple found on same day"
```

---

### Task 2: Add activity picker UI to log page

**Files:**
- Modify: `app/log/[day]/page.tsx`

When `all_activities` is present in the sync response, show a compact picker above the form. Selecting an activity updates the form fields (duration, HR, calories, training data). Secondary activities get appended to notes as a summary block.

- [ ] **Step 1: Add state for multiple activities**

In `app/log/[day]/page.tsx`, after the `garminTraining` state declaration (around line 207), add:

```typescript
  const [allGarminActivities, setAllGarminActivities] = useState<Array<{
    garmin_activity_id: number
    activity_name: string
    activity_type?: string
    duration_min: number | null
    avg_hr_bpm: number | null
    total_calories: number | null
    aerobic_training_effect: number | null
    anaerobic_training_effect: number | null
    training_stress_score: number | null
  }>>([])
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null)
```

- [ ] **Step 2: Extend the sync type and populate new state**

In the Garmin sync `useEffect`, extend the `sync` type and populate the new state after the existing `setGarminTraining(...)` call:

Extend the type (add after `hr_zones` line):
```typescript
          all_activities?: Array<{
            garmin_activity_id: number
            activity_name: string
            activity_type?: string
            duration_min: number | null
            avg_hr_bpm: number | null
            total_calories: number | null
            aerobic_training_effect: number | null
            anaerobic_training_effect: number | null
            training_stress_score: number | null
          }>
```

After `setGarminTraining({...})`, add:
```typescript
          if (sync.all_activities && sync.all_activities.length > 1) {
            setAllGarminActivities(sync.all_activities)
            setSelectedActivityId(sync.garmin_activity_id ?? null)
          }
```

- [ ] **Step 3: Extract applyActivity helper**

Above the `buildPayload` useCallback, add a helper that applies a chosen activity's fields to form state:

```typescript
  function applyActivity(activity: typeof allGarminActivities[0]) {
    if (activity.duration_min != null) setDuration(String(activity.duration_min))
    if (activity.avg_hr_bpm != null) setAvgHr(String(activity.avg_hr_bpm))
    if (activity.total_calories != null) setCalories(String(activity.total_calories))
    setGarminSynced((s) => ({ ...s, activity_id: activity.garmin_activity_id, duration: activity.duration_min != null, avg_hr: activity.avg_hr_bpm != null, calories: activity.total_calories != null }))
    setGarminTraining({
      aerobic_training_effect: activity.aerobic_training_effect,
      anaerobic_training_effect: activity.anaerobic_training_effect,
      training_stress_score: activity.training_stress_score,
      hr_zones: null,
    })

    // Append secondary activities to notes
    const secondaries = allGarminActivities.filter((a) => a.garmin_activity_id !== activity.garmin_activity_id)
    if (secondaries.length > 0) {
      const secondaryBlock = secondaries
        .map((a) => `${a.activity_name}${a.duration_min ? ` ${a.duration_min}min` : ''}${a.avg_hr_bpm ? ` avg HR ${a.avg_hr_bpm}bpm` : ''}${a.total_calories ? ` ${a.total_calories}kcal` : ''}`)
        .join(', ')
      setNotes((prev) => {
        const tag = '[Also: '
        // Replace existing secondary block if present, otherwise append
        if (prev.includes(tag)) {
          return prev.replace(/\[Also:.*?\]/, `[Also: ${secondaryBlock}]`)
        }
        return prev ? `${prev}\n[Also: ${secondaryBlock}]` : `[Also: ${secondaryBlock}]`
      })
    }
    setSelectedActivityId(activity.garmin_activity_id)
  }
```

- [ ] **Step 4: Add the picker UI**

In the JSX, find the `{/* Recovery card */}` comment and add the activity picker just above it:

```tsx
        {/* Multi-activity picker */}
        {allGarminActivities.length > 1 && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-2">
            <p className="text-amber-400/80 text-[10px] font-mono tracking-widest uppercase">
              {allGarminActivities.length} Garmin activities found — select primary
            </p>
            <div className="space-y-1">
              {allGarminActivities.map((a) => (
                <button
                  key={a.garmin_activity_id}
                  type="button"
                  onClick={() => applyActivity(a)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2 text-xs font-mono transition-colors',
                    selectedActivityId === a.garmin_activity_id
                      ? 'bg-lime-400/10 border border-lime-400/40 text-lime-300'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300',
                  )}
                >
                  <span className="font-bold">{a.activity_name}</span>
                  <span className="text-zinc-500 ml-2">
                    {[
                      a.duration_min ? `${a.duration_min}min` : null,
                      a.avg_hr_bpm ? `avg HR ${a.avg_hr_bpm}bpm` : null,
                      a.total_calories ? `${a.total_calories}kcal` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add app/log/\[day\]/page.tsx
git commit -m "feat: show activity picker when multiple Garmin activities found on same day"
```

---

### Task 3: Push

- [ ] **Step 1: Push to remote**

```bash
git push origin master
```
