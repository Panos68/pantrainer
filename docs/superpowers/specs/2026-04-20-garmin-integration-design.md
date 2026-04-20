# Garmin Connect Integration — Design

**Date:** 2026-04-20
**Status:** Approved

---

## Summary

Integrate Garmin Connect data into PanTrainer so that:
- Session logs auto-fill from actual Garmin activities (duration, avg HR, calories)
- Daily recovery data (sleep, body battery, HRV, resting HR) is fetched on demand, cached in the week document, and shown in the app
- The weekly export automatically includes all fetched recovery data for Claude to use when generating the next plan
- Claude Code has direct Garmin access via a custom MCP server for deeper analysis at plan-generation time

---

## Context

- **Auth:** Unofficial `garmin-connect` npm package (community-maintained, reverse-engineers Garmin's mobile API). No official API exists for personal use — Garmin's official API requires business approval.
- **No MFA** on the account — the stable path; MFA accounts have active auth breakage issues.
- **Pre-built MCP servers** (e.g. `@nicolasvegam/garmin-connect-mcp`) tested and rejected — get HTTP 427 challenge errors that their auth implementation doesn't handle. The `garmin-connect` npm package handles this transparently.
- **Verified working:** login, `getActivities`, `getSleepData`, `getHeartRate` — all confirmed against real account data.

---

## Architecture

```
lib/garmin.ts                    ← shared auth + typed fetch functions
     │
     ├── app/api/garmin/sync/route.ts   ← Next.js API route (activity match)
     ├── app/api/garmin/recovery/route.ts ← Next.js API route (recovery fetch + cache)
     └── mcp-garmin/index.ts            ← Custom stdio MCP server (Claude tool access)
```

**Single source of truth:** `garmin-connect` npm package handles all Garmin API calls. No duplicate auth logic. Credentials in `.env.local` (`GARMIN_EMAIL`, `GARMIN_PASSWORD`). Auth tokens cached to `data/garmin-tokens.json` — login once per token lifetime, not on every call.

---

## Data Model Changes

The week document gains one new top-level field:

```json
{
  "garmin_recovery": {
    "2026-04-20": {
      "sleep_hours": 7.8,
      "deep_sleep_hours": 1.2,
      "rem_sleep_hours": 1.3,
      "resting_hr_bpm": 35,
      "body_battery_start": 82,
      "body_battery_end": 14,
      "hrv_status": "balanced",
      "training_readiness": 68,
      "fetched_at": "2026-04-20T09:14:00Z"
    }
  }
}
```

Sessions gain two new optional fields (populated by Garmin sync, user-editable):

```json
{
  "garmin_activity_id": "12345678",
  "source": "garmin" | "manual"
}
```

`source` tracks whether the session metrics came from Garmin or were typed manually.

---

## Feature: Session Auto-fill

**Entry point:** User opens `/log/[day]` to log a session.

**Flow:**
1. Page loads → calls `GET /api/garmin/sync?date=YYYY-MM-DD`
2. API route authenticates (uses cached token), fetches activities for that date
3. Finds best match: date exact, type fuzzy (strength day → `strength_training`/`weight_training`; HYROX/conditioning → cardio/hiit types). If multiple activities on the day, picks the longest by duration.
4. Returns `{ duration_min, avg_hr_bpm, total_calories, activityId, matched: true }` or `{ matched: false }`
5. Session form pre-fills matched fields with a "Synced from Garmin" badge on each field
6. All fields remain fully editable — user can overwrite any value
7. If no match: fields are empty, no badge, user types manually as before
8. On save: `source` field written as `"garmin"` if any Garmin data was used, `"manual"` otherwise

**Override behaviour:** Editing a pre-filled field removes the "Synced" badge on that field only. Mixed state is fine (some fields from Garmin, some manual).

---

## Feature: Recovery Strip (App UI)

**Where it appears:**
- **Day card** on home screen — compact single-line strip below session status
- **Session logger** — full recovery card shown above the log form

**Compact strip (Day card):**
```
💤 7.8h  ❤️ 35bpm  🔋 82→14  HRV: balanced
```
If not yet fetched: shows `[ Fetch recovery ]` button.

**Full recovery card (Session logger):**
| Metric | Value |
|--------|-------|
| Sleep | 7.8h (deep 1.2h, REM 1.3h) |
| Resting HR | 35 bpm |
| Body Battery | 82 → 14 |
| HRV Status | Balanced |
| Training Readiness | 68 / 100 |

**Fetch behaviour:**
- Button calls `POST /api/garmin/recovery` with `{ date }`
- API fetches from Garmin, writes result into week doc under `garmin_recovery[date]`
- Week doc saved to Vercel Blob
- UI updates immediately from response — no page reload
- **Cache rule:** if `garmin_recovery[date]` already exists in the week doc, skip the Garmin call. Show a small "↻ refresh" icon for manual re-fetch.
- Recovery data persists in the week doc — survives offline after fetch

---

## Feature: Export Enrichment

No changes to the export trigger flow. The export builder reads `garmin_recovery` from the week doc and includes it as-is in the export JSON. If a day was never fetched, that date simply won't appear in `garmin_recovery` — Claude treats missing dates as "no data".

No Garmin API call at export time. Zero extra latency.

---

## Feature: Custom MCP Server

A small stdio MCP server at `mcp-garmin/index.ts`. Registered in Claude Code project config.

**Tools:**

| Tool | Arguments | Returns |
|------|-----------|---------|
| `get_week_activities` | `start_date`, `end_date` | All activities with type, duration, avg HR, calories, activityId |
| `get_recovery_snapshot` | `start_date`, `end_date` | Sleep, body battery, HRV, training readiness per date |
| `get_daily_hr` | `date` | Resting HR, max HR for that date |
| `get_last_activity` | none | Single most recent activity |

**Registration** (already added to `~/.claude.json` project config):
```json
{
  "garmin": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "tsx", "mcp-garmin/index.ts"],
    "env": {
      "GARMIN_EMAIL": "...",
      "GARMIN_PASSWORD": "..."
    }
  }
}
```

At plan-generation time in Claude Code, Claude can call these tools directly to fetch current recovery trends before writing the weekly plan — without needing the exported JSON to include it first.

---

## Implementation Scope

### In scope
- `lib/garmin.ts` — auth wrapper, token cache, typed fetch functions for: activities, sleep, HR, body battery, HRV, training readiness
- `app/api/garmin/sync/route.ts` — activity match for a given date
- `app/api/garmin/recovery/route.ts` — recovery fetch + write to week doc
- Session logger: Garmin auto-fill on load, editable fields, source tracking
- Day card: compact recovery strip + fetch button
- Session logger: full recovery card
- Export: include `garmin_recovery` passthrough (no logic change, just schema update)
- `mcp-garmin/index.ts` — custom MCP server with 4 tools
- Zod schema updates for `garmin_recovery` and session `source` field
- Update Claude Code MCP config to point at custom server instead of `@nicolasvegam/garmin-connect-mcp`

### Out of scope
- Writing workouts back to Garmin
- Garmin body composition (not needed)
- Automatic background polling / webhooks
- Support for MFA accounts
- iOS / Garmin watch app integration

---

## Error Handling

- **Garmin unreachable / 4xx:** API route returns `{ matched: false }` or `{ fetched: false }` — app falls back to empty/manual gracefully. Never blocks the user from logging.
- **Auth failure:** Clears cached token, retries login once. If login fails, surfaces a toast "Garmin sync unavailable — log manually".
- **No activity match:** Silent — session form opens empty, user logs manually as before.
- **Token expiry:** `garmin-connect` handles refresh automatically.

---

## Anti-requirements

- Does **not** call the Garmin official Health API (enterprise-only)
- Does **not** support Garmin account MFA
- Does **not** write data back to Garmin Connect
- Does **not** poll Garmin automatically — all fetches are user-triggered or page-load triggered
- Does **not** block session logging if Garmin is unavailable
