# PanTrainer

> **Built entirely with [Claude Code](https://claude.ai/code) (Anthropic) — AI-generated codebase.**

A personal training management app with Garmin sync, AI-generated weekly plans, and photo-based calorie/macro tracking — all reachable through a built-in MCP server so Claude can read and write your training data directly. Hosted on Vercel — accessible from phone or desktop.

## What it does

- **Log sessions on your phone** — duration, HR, calories, exercises, notes
- **Garmin auto-fill** — session metrics (duration, avg HR, calories) pulled from your watch on the log page
- **Recovery data** — sleep, resting/max HR, Body Battery, stress, VO2 max, fitness age, and daily calorie burn fetched from Garmin per day; cached in the week doc. A nightly cron job finalizes the previous day's burn once it's no longer a partial snapshot.
- **Structured exercise logging** — planned sets/reps/weight pre-filled, edit actuals per exercise, with per-set logging and lift progression tracking
- **Food-photo calorie/macro tracking** — photograph meals (or type a note); an MCP server lets Claude analyze photos against a personal pantry of staple foods, save per-meal/per-item macro estimates, and report calorie balance against Garmin's burn
- **Pantry staples** — a library of the athlete's regular foods with exact per-100g macros and usual portions, so repeat meals stay consistent instead of drifting each estimate
- **Readiness & training load** — a daily readiness score and ACWR (acute:chronic workload ratio) zone computed from recent sessions and recovery data
- **Archived-week history** — every completed week is archived and still browsable/reviewable (training, recovery, and nutrition) after it rolls off the current week
- **Export to Claude** — downloads a structured JSON snapshot of your week including Garmin recovery data
- **Export v2 (Coach Context)** — optional enriched export with derived readiness/load/adherence metrics for A/B plan quality checks
- **Import Claude's plan** — paste the AI response back to load next week's sessions and exercises
- **Progress charts** — conditioning output and lift progression over time
- **Deload tracking** — automatic reminders after 4 weeks of high output
- **Password protected** — single-password auth, stays logged in for a year

## MCP server

`/api/mcp` exposes an [MCP](https://modelcontextprotocol.io) server so Claude can act on your training data directly in conversation, rather than through copy/paste export-import. Tools include:

- `get_current_week` / `get_lift_history` — read current sessions and exercise history
- `get_current_context` — compact daily coaching context with today’s full session, weekly schedule, summaries, and rules without repeated set-log history
- `submit_proposed_plan` / `submit_proposal_by_date` — write a candidate plan for review in the app
- `get_garmin_recovery_freshness` — check whether cached recovery/burn data for a date is present and final before trusting it
- `list_food_photos_for_range` / `save_nutrition_estimate` / `get_nutrition_summary_for_range` — analyze food photos and notes against the pantry, save macro estimates, and find days with unanalyzed content

## The loop

```
Log sessions on phone → Export JSON → Paste into Claude chat → Claude plans next week
          ↑                                                              |
          └──────────────── Import JSON response ───────────────────────┘
```

Workout photos uploaded on the log page are stored in Vercel Blob and saved on each session. Export JSON includes their URLs in `photos_to_attach`.

## Garmin Connect integration

Uses the unofficial [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) npm package (no official personal-use API exists). Requires a Garmin account **without MFA**.

- **Session auto-fill** — on opening `/log/[day]`, the app fetches activities for that date and pre-fills duration, avg HR, and calories. Fields remain fully editable.
- **Recovery fetch** — click "Fetch recovery" on a day to pull sleep and HR data. Cached in the week document; subsequent loads use the cache.
- **Garmin recovery in exports** — the weekly JSON export includes all fetched recovery data for Claude to use when generating the next plan.

OAuth tokens are cached in Vercel Blob (`data/garmin-tokens.json`) so login only happens once per token lifetime. Garmin's Cloudflare protection rate-limits repeated login attempts — if you see 429 errors, wait ~24 hours for the ban to lift.

## Tech stack

- **Next.js 15** (App Router, server + client components)
- **TypeScript** + **Zod** (runtime schema validation)
- **Tailwind CSS v4** (zinc dark theme)
- **Recharts** (progress charts)
- **MongoDB** (week docs, nutrition log, pantry, exercise mappings)
- **Vercel Blob** (session/food photos, Garmin token cache)
- **`@modelcontextprotocol/sdk`** (the `/api/mcp` server Claude connects to)
- **Vercel** (hosting — free hobby plan, includes the nightly finalize-day cron)

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add BLOB_READ_WRITE_TOKEN and AUTH_PASSWORD to .env.local
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string (week docs, nutrition log, pantry) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (from Vercel dashboard → Storage) |
| `AUTH_PASSWORD` | Owner password with full Pantrainer and MCP access |
| `FOOD_ACCESS_PASSWORD` | Restricted shared-food password; only accesses `/food` |
| `AUTH_SESSION_SECRET` | Long random value used to sign browser role sessions |
| `AUTOMATION_API_TOKEN` | Bearer token used by scheduled cowork jobs to write proposed plans |
| `GARMIN_EMAIL` | Garmin Connect account email (optional — Garmin features disabled if unset) |
| `GARMIN_PASSWORD` | Garmin Connect account password |
| `RENPHO_EMAIL` | Renpho account email (optional — weight/body-composition sync disabled if unset) |
| `RENPHO_PASSWORD` | Renpho account password |
| `CRON_SECRET` | Bearer token Vercel Cron sends to authorize the nightly finalize-day job |

## Proposed plan automation (daily/weekly)

- Scheduled jobs should write candidate plans to `POST /api/automation/proposed` (Bearer token auth via `AUTOMATION_API_TOKEN`).
- Candidate payloads are stored as a **proposed** plan (not live/current).
- In the app (`/export`), use **Load proposed JSON** to review before applying.
- Save context/rules for automation in **Automation notes** on the same page.

### API-only cowork flow (no browser login)

- `GET /api/automation/export/v2` returns:
  - `export_v2`: full current week export v2 payload
  - `automation_notes`: current notes/rules
- `POST /api/automation/proposed/today` accepts a single session update (`session` object or `json` string), merges it into today's session, and stores it as the latest proposed week.
- Both endpoints require `Authorization: Bearer <AUTOMATION_API_TOKEN>`.
- UI day-level review uses `GET /api/proposed/session?date=YYYY-MM-DD` to load only that day from the latest proposed week.

## Deploying to Vercel

1. Push to GitHub
2. Import repo at vercel.com/new
3. Create a Blob store: Vercel dashboard → Storage → Create → Blob → connect to project
4. Add `AUTH_PASSWORD` in Project Settings → Environment Variables
5. Deploy

## Migrating existing data

If you have local `data/` JSON files to upload to Blob:

```bash
BLOB_READ_WRITE_TOKEN=your_token npx tsx scripts/migrate-to-blob.ts
```

---

*This project was designed and built through an extended conversation with Claude Code. The architecture, schema design, UI, and all implementation were AI-generated based on product requirements defined by the user.*
