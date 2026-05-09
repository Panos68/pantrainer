# Saved Recovery Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the daily recovery score once (on check-in and Garmin sync) and persist it to the week document so all consumers read the same value.

**Architecture:** Add `daily_scores` to `WeekDoc` schema. Extract `calcACWR` into a shared `lib/daily-score.ts` helper that computes the full score. Both write routes (readiness POST and garmin POST) call this helper and save the result before writing the week. Export and the readiness GET read the saved score instead of recomputing.

**Tech Stack:** Next.js 16 App Router, Zod, TypeScript, date-fns

---

## File Map

| File | Change |
|------|--------|
| `lib/schema.ts` | Add `RecoveryScoreBreakdownSchema`; add `daily_scores` field to `WeekDocSchema` |
| `lib/daily-score.ts` | **New** — `calcACWR` (moved from readiness route) + `computeDailyScore` |
| `app/api/readiness/route.ts` | POST: compute+attach score before writeCurrentWeek; GET: read from `daily_scores` with fallback |
| `app/api/garmin/recovery/route.ts` | After saving garmin data, compute+attach score before writeCurrentWeek |
| `lib/export.ts` | Read `daily_scores[todayDate]` instead of re-running ACWR + calcRecoveryScore |

---

### Task 1: Add `RecoveryScoreBreakdownSchema` and `daily_scores` to schema

**Files:**
- Modify: `lib/schema.ts`

- [ ] **Step 1: Add `RecoveryScoreBreakdownSchema` above `WeekDocSchema`**

In `lib/schema.ts`, after the `DailyReadinessSchema` block (around line 97), add:

```ts
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
```

- [ ] **Step 2: Add `daily_scores` field to `WeekDocSchema`**

In `lib/schema.ts`, in `WeekDocSchema` after the `daily_readiness` line (line 146):

```ts
daily_scores: z.record(z.string(), RecoveryScoreBreakdownSchema).default({}),
```

- [ ] **Step 3: Remove `RecoveryScoreBreakdown` interface from `lib/recovery-score.ts`**

`lib/recovery-score.ts` defines its own `RecoveryScoreBreakdown` interface at the top. Replace it with an import from schema:

```ts
import type { RecoveryScoreBreakdown } from './schema'
```

Remove the `export interface RecoveryScoreBreakdown { ... }` block (lines 3–11).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts lib/recovery-score.ts
git commit -m "feat(schema): add RecoveryScoreBreakdownSchema and daily_scores to WeekDoc"
```

---

### Task 2: Create `lib/daily-score.ts`

**Files:**
- Create: `lib/daily-score.ts`

This module owns the ACWR calculation and the full score computation. It has no I/O — all inputs are passed in.

- [ ] **Step 1: Create `lib/daily-score.ts`**

```ts
import { calcRecoveryScore } from './recovery-score'
import { sessionToLoadPoint } from './training-load'
import type { WeekDoc, RecoveryScoreBreakdown } from './schema'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'

type LoadPoint = NonNullable<ReturnType<typeof sessionToLoadPoint>>

export function calcACWR(loadPoints: LoadPoint[]): number | null {
  if (loadPoints.length < 3) return null
  const sorted = [...loadPoints].sort((a, b) => a.date.localeCompare(b.date))
  const oldest = parseISO(sorted[0].date)
  const latest = parseISO(sorted[sorted.length - 1].date)
  if (differenceInDays(latest, oldest) < 21) return null
  const latestStr = format(latest, 'yyyy-MM-dd')
  const acuteStart = format(subDays(latest, 6), 'yyyy-MM-dd')
  const chronicStart = format(subDays(latest, 27), 'yyyy-MM-dd')
  const acute = sorted.filter((p) => p.date >= acuteStart).reduce((s, p) => s + p.training_load, 0)
  const chronicPoints = sorted.filter((p) => p.date >= chronicStart && p.date <= latestStr)
  const chronic = chronicPoints.length > 0 ? chronicPoints.reduce((s, p) => s + p.training_load, 0) / 4 : null
  if (!chronic || chronic === 0) return null
  return Math.round((acute / chronic) * 100) / 100
}

export function computeDailyScore(
  date: string,
  week: WeekDoc,
  archivedWeeks: WeekDoc[],
): RecoveryScoreBreakdown {
  const athlete = { rhr: week.athlete.rhr_bpm, maxHr: 220 - week.athlete.age }
  const allSessions = [...archivedWeeks.flatMap((w) => w.sessions), ...week.sessions]
  const loadPoints = allSessions
    .filter((s) => s.status === 'completed' && s.date <= date)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is LoadPoint => p !== null)

  const acwr = calcACWR(loadPoints)
  const garmin = week.garmin_recovery?.[date] ?? null
  const readiness = week.daily_readiness?.[date] ?? null

  return calcRecoveryScore(garmin, week.athlete.rhr_bpm, acwr, readiness)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/daily-score.ts
git commit -m "feat(daily-score): extract calcACWR and computeDailyScore into shared lib"
```

---

### Task 3: Save score in `POST /api/readiness`

**Files:**
- Modify: `app/api/readiness/route.ts`

- [ ] **Step 1: Update imports**

Replace the existing imports at the top of `app/api/readiness/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { readCurrentWeekDirect, readDailyReadiness, readAthleteProfile, readArchivedWeeks, writeCurrentWeek } from '@/lib/data'
import { DailyReadinessSchema } from '@/lib/schema'
import { calcRecoveryScore } from '@/lib/recovery-score'
import { computeDailyScore, calcACWR } from '@/lib/daily-score'
import { sessionToLoadPoint } from '@/lib/training-load'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'
```

- [ ] **Step 2: Remove the local `calcACWR` function**

Delete lines 12–28 (the `function calcACWR(...)` block) — it now lives in `lib/daily-score.ts`.

Update the GET handler to use the imported `calcACWR` — the call site is already using a local variable named `acwr`, so only the function definition needs removing. Verify the GET handler still calls `calcACWR(loadPoints)` using the imported version.

- [ ] **Step 3: Update `readCurrentWeekDirect` import**

The POST handler currently calls `writeDailyReadiness` from data. Replace that with a direct read-modify-write so we can attach the score in the same write. Update the import line to include `readCurrentWeekDirect` and `writeCurrentWeek` (already added in Step 1).

- [ ] **Step 4: Rewrite the POST handler**

Replace the entire `export async function POST(...)` with:

```ts
export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = DailyReadinessSchema.safeParse({
    ...body,
    logged_at: new Date().toISOString(),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const week = await readCurrentWeekDirect()
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  week.daily_readiness = { ...week.daily_readiness, [parsed.data.date]: parsed.data }

  try {
    const archivedWeeks = await readArchivedWeeks(8)
    const score = computeDailyScore(parsed.data.date, week, archivedWeeks)
    week.daily_scores = { ...week.daily_scores, [parsed.data.date]: score }
  } catch {
    // score persistence is best-effort — don't block saving readiness
  }

  await writeCurrentWeek(week)

  return NextResponse.json(
    { ok: true, readiness: parsed.data },
    { headers: NO_STORE_HEADERS },
  )
}
```

- [ ] **Step 5: Update GET handler to read saved score first**

In the GET handler, after computing `score` with `calcRecoveryScore(...)`, replace that assignment with a read from `daily_scores` with fallback:

Find this section (around line 61):
```ts
const score = calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness)
```

Replace with:
```ts
const savedScore = week.daily_scores?.[date]
const score = savedScore ?? calcRecoveryScore(garmin, profile.rhr_bpm, acwr, readiness)
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/readiness/route.ts
git commit -m "feat(readiness): compute and persist daily score on check-in POST"
```

---

### Task 4: Save score in `POST /api/garmin/recovery`

**Files:**
- Modify: `app/api/garmin/recovery/route.ts`

- [ ] **Step 1: Add imports**

Add to the top of `app/api/garmin/recovery/route.ts`:

```ts
import { readArchivedWeeks } from '@/lib/data'
import { computeDailyScore } from '@/lib/daily-score'
```

- [ ] **Step 2: Attach score before the final `writeCurrentWeek` call**

In the POST handler, find the block that writes Garmin data (around line 91–96):

```ts
if (hasAnyRecoveryMetric(recovery)) {
  const freshWeek = await readCurrentWeekDirect()
  if (freshWeek) {
    freshWeek.garmin_recovery = { ...freshWeek.garmin_recovery, [date]: recovery }
    await writeCurrentWeek(freshWeek)
  }
}
```

Replace with:

```ts
if (hasAnyRecoveryMetric(recovery)) {
  const freshWeek = await readCurrentWeekDirect()
  if (freshWeek) {
    freshWeek.garmin_recovery = { ...freshWeek.garmin_recovery, [date]: recovery }
    try {
      const archivedWeeks = await readArchivedWeeks(8)
      const score = computeDailyScore(date, freshWeek, archivedWeeks)
      freshWeek.daily_scores = { ...freshWeek.daily_scores, [date]: score }
    } catch {
      // score persistence is best-effort
    }
    await writeCurrentWeek(freshWeek)
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/garmin/recovery/route.ts
git commit -m "feat(garmin): compute and persist daily score on garmin sync"
```

---

### Task 5: Update export to read saved score

**Files:**
- Modify: `lib/export.ts`

- [ ] **Step 1: Remove the independent score calculation in `buildCoachContext`**

In `lib/export.ts`, find the block around lines 236–240:

```ts
// Recovery score for today
const todayDate = format(new Date(), 'yyyy-MM-dd')
const todayGarmin = currentWeek.garmin_recovery?.[todayDate] ?? null
const todayReadiness = currentWeek.daily_readiness?.[todayDate] ?? null
const todayScore = calcRecoveryScore(todayGarmin, currentWeek.athlete.rhr_bpm, acwr, todayReadiness)
```

Replace with:

```ts
// Recovery score for today — read persisted score, fall back to live computation
const todayDate = format(new Date(), 'yyyy-MM-dd')
const todayScore = currentWeek.daily_scores?.[todayDate] ?? (() => {
  const todayGarmin = currentWeek.garmin_recovery?.[todayDate] ?? null
  const todayReadiness = currentWeek.daily_readiness?.[todayDate] ?? null
  return calcRecoveryScore(todayGarmin, currentWeek.athlete.rhr_bpm, acwr, todayReadiness)
})()
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/export.ts
git commit -m "fix(export): read persisted daily_scores instead of recomputing recovery score"
```

---

### Task 6: Push and verify

- [ ] **Step 1: Push to remote**

```bash
git push
```

- [ ] **Step 2: Manual verification checklist**

After Vercel deploys:

1. Open the app homepage — note the recovery score shown in the panel
2. Submit a check-in (or re-submit if one exists today) — score should update immediately
3. Open the export page and generate an export — `readiness_summary.today_score` should match the panel score
4. Trigger a Garmin sync from a session page — return to homepage, score should update to reflect new sleep/RHR data
