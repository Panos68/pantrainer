# Saved Recovery Score Design

**Date:** 2026-05-09  
**Status:** Approved

## Problem

The recovery score is computed independently in two places — the app's readiness panel (`GET /api/readiness`) and the export (`lib/export.ts`) — using different inputs (different archive depths, missing minimum-history guard in export). This causes the score shown in the app to differ from the one included in the export.

## Solution

Compute the score once and persist it to the week document. Every consumer reads the saved score; no consumer recalculates.

## Schema Change

Add `daily_scores` to `WeekDoc`:

```ts
daily_scores: z.record(z.string(), RecoveryScoreBreakdownSchema).default({})
```

`RecoveryScoreBreakdownSchema` is the existing `{ total, sleep, rhr, load, subjective, label, color }` shape, extracted from `lib/recovery-score.ts` into the schema file.

## Write Triggers

The score is recomputed and persisted whenever either of its two data sources is updated:

1. **`POST /api/readiness`** — after saving `daily_readiness`, compute score with the new readiness + existing Garmin + ACWR, write to `daily_scores[date]`.
2. **`POST /api/garmin/recovery`** — after saving `garmin_recovery`, compute score with the new Garmin + existing readiness + ACWR, write to `daily_scores[date]`.

Both routes already read archived weeks for ACWR (or can cheaply do so). Last write wins — Garmin arriving after check-in overwrites with a more complete score.

## ACWR Computation

Both write routes will compute ACWR the same way `GET /api/readiness` does today:
- Load `readArchivedWeeks(8)` + current week sessions
- Apply the 21-day minimum history guard (return `null` if insufficient)
- Pass result to `calcRecoveryScore`

## Read Consumers

- **App panel (`GET /api/readiness`):** Returns `daily_scores[date]` if present; falls back to live-computed score for backward compatibility during rollout and for dates before this feature existed.
- **Export (`lib/export.ts`):** Reads `daily_scores[todayDate]` directly. Removes the independent ACWR + `calcRecoveryScore` call entirely.

## What Does NOT Change

- `calcRecoveryScore` function is unchanged.
- Check-in UX is unchanged (still optional).
- `daily_readiness` and `garmin_recovery` storage is unchanged — they remain the source of truth; `daily_scores` is a derived cache.

## Error Handling

If score computation fails during a write (e.g. schema mismatch), the write itself still succeeds — score persistence is best-effort and does not block saving readiness or Garmin data.
