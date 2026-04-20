# PanTrainer

> **Built entirely with [Claude Code](https://claude.ai/code) (Anthropic) — AI-generated codebase.**

A personal training management app that closes the loop between logging workouts and AI-powered weekly planning. Hosted on Vercel — accessible from phone or desktop.

## What it does

- **Log sessions on your phone** — duration, HR, calories, exercises, notes
- **Garmin auto-fill** — session metrics (duration, avg HR, calories) pulled from your watch on the log page
- **Recovery data** — fetch sleep, resting HR, and max HR from Garmin per day; cached in the week doc
- **Structured exercise logging** — planned sets/reps/weight pre-filled, edit actuals per exercise
- **Export to Claude** — downloads a structured JSON snapshot of your week including Garmin recovery data
- **Import Claude's plan** — paste the AI response back to load next week's sessions and exercises
- **Progress charts** — conditioning output and lift progression over time
- **Deload tracking** — automatic reminders after 4 weeks of high output
- **Password protected** — single-password auth, stays logged in for a year

## The loop

```
Log sessions on phone → Export JSON → Paste into Claude chat → Claude plans next week
          ↑                                                              |
          └──────────────── Import JSON response ───────────────────────┘
```

For workout photos (whiteboard schedules): attach directly to Claude chat alongside the JSON export — no in-app storage needed.

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
- **Vercel Blob** (cloud JSON storage — free tier)
- **Vercel** (hosting — free hobby plan)

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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (from Vercel dashboard → Storage) |
| `AUTH_PASSWORD` | Password to access the app |
| `GARMIN_EMAIL` | Garmin Connect account email (optional — Garmin features disabled if unset) |
| `GARMIN_PASSWORD` | Garmin Connect account password |

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
