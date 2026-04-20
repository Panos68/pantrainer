# PanTrainer — Hosting Refactor Design

**Date:** 2026-04-20
**Scope:** Migrate from local-only desktop app to hosted web app accessible on phone, remove Notion, add structured exercise logging with planned vs actual tracking.

---

## Problem

The current app runs locally on Mac only. Mobile logging requires Notion as a bridge, adding friction and a sync step. The goal is to make the app accessible from any device (phone during workouts, desktop for weekly review) with no intermediary.

---

## Constraints

- Fully free (no paid services beyond existing Claude.ai subscription)
- No native mobile app — responsive web only
- JSON export/import workflow with Claude stays unchanged
- Data must be accessible from both phone and desktop simultaneously

---

## Architecture

Next.js 15 app deployed to **Vercel** (free tier). Data stored in **Vercel Blob** (free tier: 500MB — sufficient for years of training data).

The only structural change is the data layer: local `fs` calls in `lib/data.ts` are replaced with Vercel Blob SDK reads/writes. All API routes, components, export/import logic, and charts are unchanged.

**Removed:** Notion integration entirely (`lib/notion.ts`, Notion API routes, `NotionSync.tsx`).

---

## Data Storage

Vercel Blob stores JSON files with the same structure as the current local `data/` directory:

| Blob key | Contents |
|----------|----------|
| `data/current-week.json` | Active week document |
| `data/athlete.json` | Athlete profile |
| `data/state.json` | Gym alternation, deload counter |
| `data/weeks/week-YYYY-WW.json` | Archived weeks |

Writes are full-file overwrites (read → modify in memory → write back). Files are a few KB each — no performance concern.

**One-time migration:** On first deploy, existing `data/` JSON files are uploaded to Blob manually. The app takes over from there.

---

## Structured Exercise Logging

Claude's JSON output already includes structured exercises inside `sessions[].exercises`:

```json
{
  "name": "Deadlift",
  "sets": 3,
  "reps": 5,
  "weight_kg": 95,
  "notes": "Focus on bracing"
}
```

### Schema change

Add actual fields to the Exercise schema in `lib/schema.ts`:

```typescript
{
  name: string
  sets: number
  reps: number | string        // planned
  weight_kg: number | null     // planned
  notes?: string
  actual_sets?: number         // logged by user
  actual_reps?: number | string
  actual_weight_kg?: number | null
}
```

### SessionLogger UI (Strength sessions)

Replace the free-text notes field with a structured exercise table:

| Exercise | Pl. Sets | Pl. Reps | Pl. Weight | Act. Sets | Act. Reps | Act. Weight |
|----------|----------|----------|------------|-----------|-----------|-------------|
| Deadlift | 3 | 5 | 95 kg | `[ ]` | `[ ]` | `[95]` |
| Pull-ups | 4 | 6 | +5 kg | `[ ]` | `[ ]` | `[5]` |

- Planned values pre-filled from the imported session, read-only
- Actual columns are editable inputs, pre-filled with planned values as defaults
- User only changes what differs from the plan
- On save, `actual_weight_kg` values auto-update `lift_progression` for named lifts

### lift_progression auto-update

When a Strength session is saved as complete, `lib/export.ts` (or a new `lib/progression.ts` helper) scans the actual exercise weights and updates `lift_progression` for any matching lift names. No confirmation prompt — actual achieved weight is the source of truth.

---

## Mobile UI

No redesign — responsive adjustments only:

- **WeekGrid** — stacks to a single column on small screens
- **SessionLogger** — full-width inputs, large tap targets, sticky "Save" / "Mark Complete" buttons pinned to bottom of screen
- **Export/Import page** — textarea for JSON paste works on mobile (paste from clipboard)
- **PWA** — app is "Add to Home Screen" compatible on iPhone for app-like experience (no extra configuration needed with Next.js)

---

## Photo Workflow

Photos are not stored in the app. The workflow:

1. Take whiteboard photo during Saturday class
2. Log session in app on phone (duration, HR, notes)
3. At weekly review — export JSON from app, open Claude.ai, paste JSON + attach whiteboard photo from camera roll
4. Claude reads both and incorporates workout into plan

This keeps the app simple and uses Claude's native image understanding, which is better than any free OCR library for whiteboard/handwritten text.

---

## What's Removed

| Item | Reason |
|------|--------|
| `lib/notion.ts` | Replaced by hosted app |
| `app/api/notion/push/route.ts` | No longer needed |
| `app/api/notion/pull/route.ts` | No longer needed |
| `components/NotionSync.tsx` | No longer needed |
| `.env.local` NOTION_TOKEN, NOTION_DATABASE_ID | No longer needed |

---

## What's Added

| Item | Purpose |
|------|---------|
| `@vercel/blob` package | Blob SDK for data reads/writes |
| BLOB_READ_WRITE_TOKEN env var | Vercel Blob auth (set in Vercel dashboard) |
| Actual fields on Exercise schema | Track planned vs achieved |
| Responsive CSS on WeekGrid + SessionLogger | Mobile usability |

---

## Deployment

1. Push repo to GitHub
2. Connect to Vercel (free) — auto-deploys on push
3. Add `BLOB_READ_WRITE_TOKEN` in Vercel environment variables
4. Upload existing `data/` files to Blob storage once (via Vercel dashboard or a one-off script)
5. Done — app live at `https://pantrainer.vercel.app` (or custom domain)

---

## Out of Scope (Future)

- Garmin integration — separate spec, separate implementation cycle
- Push notifications for workout reminders
- Multi-user support
- Native iOS app
