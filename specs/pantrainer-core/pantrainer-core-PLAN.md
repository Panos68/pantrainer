---
name: PanTrainer Core — Plan
description: Implementation plan with component breakdown, task checklist, and suggested order
type: project
---

## Tech Stack Decision

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | **Next.js 15** (App Router) | Handles frontend + API routes in one process. `next dev` is all you need. No separate server. |
| Styling | **Tailwind CSS + shadcn/ui** | Free, clean, dark theme (matches your existing HTML aesthetic). Zero design work. |
| Validation | **Zod** | Validates Claude's JSON on import. Critical — if schema drifts, import fails gracefully. |
| Charts | **Recharts** | Lightweight, React-native, no config. |
| Notion | **@notionhq/client** | Official SDK, handles rate limits and retries. |
| Storage | **Local JSON files** | No database needed. Files in `data/` are human-readable, directly editable. |
| Runtime | **Node.js** (via Next.js) | File I/O in API routes. No extra dependencies. |

**Run command:** `npm run dev` — opens at `http://localhost:3000`

---

## Project File Structure

```
pantrainer/
├── app/
│   ├── layout.tsx                  # Root layout, dark theme
│   ├── page.tsx                    # Home: weekly plan overview
│   ├── log/[day]/page.tsx          # Session logging page
│   ├── progress/page.tsx           # Progress charts
│   ├── setup/page.tsx              # First-run: athlete profile + baseline weights
│   └── api/
│       ├── week/route.ts           # GET current week / POST new week
│       ├── session/[day]/route.ts  # PATCH log a session
│       ├── export/route.ts         # POST generate export JSON
│       ├── import/route.ts         # POST apply Claude response
│       ├── history/route.ts        # GET archived weeks (for charts + export history)
│       ├── state/route.ts          # GET/PATCH app state (gym alt, deload counter)
│       ├── notion/push/route.ts    # POST push week to Notion
│       └── notion/pull/route.ts    # POST pull logs from Notion
├── components/
│   ├── WeekGrid.tsx                # 7-day overview grid
│   ├── DayCard.tsx                 # Single day: status, type, summary
│   ├── SessionLogger.tsx           # Log form (pre-filled from plan)
│   ├── LiftProgressChart.tsx       # Weight over time per lift
│   ├── ConditioningChart.tsx       # Avg HR + calories per session
│   ├── HealthFlagsBanner.tsx       # Active health flags display
│   ├── DeloadBanner.tsx            # Deload reminder / prompt
│   └── GymWeekBadge.tsx            # "WEEK A — PULL" indicator
├── lib/
│   ├── schema.ts                   # Zod schemas (WeekDoc, Session, LiftProgression, etc.)
│   ├── data.ts                     # Read/write JSON files in data/
│   ├── state.ts                    # App state helpers (gym alt, deload)
│   ├── export.ts                   # Assemble export JSON with history block
│   ├── import.ts                   # Validate + apply imported Claude JSON
│   └── notion.ts                   # Notion API client (push/pull)
├── data/                           # Local data store — gitignored
│   ├── current-week.json           # Active week document
│   ├── athlete.json                # Athlete profile
│   ├── state.json                  # { gymWeek, deloadCounter, lastDeloadWeek, notionLastSync }
│   └── weeks/                      # Archived week JSONs (week-YYYY-WW.json)
├── exports/                        # Export files — gitignored
├── .env.local                      # NOTION_TOKEN, NOTION_DATABASE_ID
├── .gitignore
├── tailwind.config.ts
└── package.json
```

---

## Task Checklist

### Phase A — Foundation

- [ ] **T1: Project scaffold**
  Create Next.js 15 app with Tailwind, shadcn/ui, Zod, Recharts, @notionhq/client. Set up `data/`, `exports/` directories. Configure `.gitignore` to exclude both. Add `README.md` with run instructions.
  Fulfills: R31, R32
  Done when: `npm run dev` opens a blank app at localhost:3000 with no errors.

- [ ] **T2: Zod schema + data layer**
  Define Zod schemas in `lib/schema.ts` for: `Session`, `WeekSummary`, `LiftProgression`, `HealthFlag`, `NextWeekPlan`, `WeekDoc`, `AthleteProfile`, `AppState`. Implement `lib/data.ts` with: `readCurrentWeek()`, `writeCurrentWeek()`, `readAthleteProfile()`, `writeAthleteProfile()`, `readAppState()`, `writeAppState()`, `archiveWeek()`, `readArchivedWeeks(n)`.
  Fulfills: R1, R28
  Done when: All schema types compile, read/write roundtrip works for each file.

- [ ] **T3: First-run setup page**
  `/setup` page with form to enter athlete profile (name, age, weight, SMM, BF%, BMR, RHR baseline) and initial `lift_progression` key-value pairs (pre-filled with baseline weights from existing plan). Saves to `data/athlete.json`. Redirect to home on completion. Show "Setup complete" if data already exists.
  Fulfills: Dependencies (athlete profile, baseline weights)
  Done when: Submitting the form writes valid `athlete.json` and redirects home.

- [ ] **T4: App state initialisation**
  `lib/state.ts` helpers: `getGymWeek()` → `'week_a' | 'week_b' | 'legs_week'`, `advanceGymWeek()`, `getDeloadCounter()`, `incrementDeloadCounter()`, `resetDeloadCounter()`. Initialise `data/state.json` with defaults on first run.
  Fulfills: R2, R6, R7, R8
  Done when: Gym week alternates correctly across mock advance calls.

---

### Phase B — Core Week Loop

- [ ] **T5: Week API routes**
  `GET /api/week` → returns `current-week.json` (or empty if none). `POST /api/week/new` → creates a new week document pre-populated from `next_week_plan` of previous week and current `lift_progression` from state, advances gym alternation.
  Fulfills: R3, R4
  Done when: New week creates correct document with previous weights carried forward.

- [ ] **T6: Home page — WeekGrid**
  `/` page renders `WeekGrid` with 7 `DayCard` components. Each card shows: day name, session type/subtype, status badge (`planned | in_progress | completed | skipped`), summary metrics if logged. Clicking a card navigates to `/log/[day]`. Include `GymWeekBadge` and `DeloadBanner` (shown when counter ≥ 4).
  Fulfills: R2, R6, R7
  Done when: Home renders all 7 days with correct status badges.

- [ ] **T7: Session logging page + API**
  `/log/[day]` renders `SessionLogger` form. Pre-fills: type/subtype from `next_week_plan` text, duration/HR/calories empty, notes pre-filled with relevant `lift_progression` entries (for gym days). Form fields: type, subtype, duration, avg HR, total calories, notes, photos (file path input, gym days only). "Save partial" and "Mark complete" buttons. "Mark skipped" with optional note. `PATCH /api/session/[day]` writes session into current week JSON, recalculates `week_summary`.
  Fulfills: R9, R10, R11, R12, R13, R14, R15
  Done when: Logging a session updates current-week.json and redirects to home with correct status badge.

---

### Phase C — Export / Import

- [ ] **T8: Export builder**
  `lib/export.ts`: `buildExport(currentWeek, archivedWeeks)` → assembles full export JSON. Appends `history` block with last 4 archived weeks (R23: session counts, calories, strength/conditioning days, peak lift weights per week). Adds `photos_to_attach` array from sessions with photo paths. Returns validated `WeekDoc` + history.
  Fulfills: R20, R22, R23
  Done when: Output JSON matches expected schema with history populated correctly.

- [ ] **T9: Import validator**
  `lib/import.ts`: `validateImport(raw: string)` → JSON.parse + Zod validation. Returns `{ ok: true, data: WeekDoc }` or `{ ok: false, raw: string, errors: string[] }`. `applyImport(data: WeekDoc)` → archives current week, creates new week from `next_week_plan`, carries `lift_progression` and `health_flags` forward, advances gym alternation, increments deload counter.
  Fulfills: R24, R25, R26, R27
  Done when: Valid JSON applies cleanly; invalid JSON returns errors without touching data.

- [ ] **T10: Export / Import UI page**
  `/export` page with two sections:
  - **Export:** shows current week summary + "Export Week" button → calls `POST /api/export`, triggers file download of `week-YYYY-WW.json`, shows `photos_to_attach` list with "attach these to your Claude message" instruction.
  - **Import:** textarea for pasting Claude's JSON response + "Import Plan" button → calls `POST /api/import`, shows success summary (next week preview) or error with raw text fallback.
  Fulfills: R20, R21, R22, R24, R25, R26
  Done when: Full export→import roundtrip works end-to-end with sample data.

---

### Phase D — Notion Sync

- [ ] **T11: Notion API client**
  `lib/notion.ts`: `pushWeekToNotion(week: WeekDoc)` → creates or updates 7 pages in a Notion database (one per day), each with: day name, session type, `next_week_plan` guidance text, and a blank log template (duration, HR, calories, notes fields as Notion properties or page content). `pullWeekFromNotion(week: WeekDoc)` → reads each day's page and merges filled fields back into session records (only overwrites `planned` or `in_progress` sessions).
  Fulfills: R16, R17, R18, R19
  Done when: Push creates 7 Notion pages; pull reads them back and merges without overwriting completed sessions.

- [ ] **T12: Notion sync UI**
  Add "Sync" section to home page: "Push to Notion" button, "Pull from Notion" button, last sync timestamp. Show spinner during sync, error toast on failure, success toast with count of pages updated.
  Fulfills: R18, R19
  Done when: Both buttons work end-to-end with a real Notion workspace.

---

### Phase E — Progress Tracking

- [ ] **T13: History API + lift chart**
  `GET /api/history` → returns all archived week JSONs sorted by date. `LiftProgressChart` component: reads `lift_progression` from each archived week, plots selected lift weight over time using Recharts `LineChart`. Default view shows bench, deadlift, pull-ups, OHP. User can toggle lifts.
  Fulfills: R28, R29
  Done when: Chart renders correctly from 2+ archived weeks of data.

- [ ] **T14: Conditioning trend chart**
  `ConditioningChart` component: reads all sessions with `type === 'Conditioning'` from history, plots `avg_hr_bpm` and `total_calories` per session date using Recharts. Shown on progress page alongside lift chart.
  Fulfills: R30
  Done when: Chart renders with sample conditioning sessions.

---

### Phase F — Polish & Reliability

- [ ] **T15: Health flags carry-forward + display**
  `HealthFlagsBanner` component: shown on home page when `health_flags` array is non-empty. Each flag shows: label, status, training impact, action. "Clear" button per flag removes it from current week JSON. Import automatically carries uncleared flags to next week.
  Fulfills: R5
  Done when: Health flag from previous week appears in new week after import; cleared flags do not carry forward.

- [ ] **T16: Deload counter + prompts**
  Wire deload counter into week archiving. At counter = 4: `DeloadBanner` shows on home page ("Deload due next week — consider dropping to 2 HYROX classes"). At counter = 5: modal prompt with "Flag this week as deload" button. Flagging adds deload marker to export and resets counter after archive.
  Fulfills: R6, R7, R8
  Done when: Banner appears at week 4, modal at week 5, counter resets after deload week archived.

- [ ] **T17: Offline resilience**
  Ensure all session logging, plan viewing, and chart rendering work without Notion credentials configured. Notion sync buttons disabled (not erroring) when `NOTION_TOKEN` is absent. `data/` directory read/write works entirely without network.
  Fulfills: R31
  Done when: App fully functional with Notion env vars unset.

---

## Suggested Implementation Order

```
T1 → T2 → T3 → T4          (Foundation — sequential, each depends on previous)
          ↓
     T5 → T6 → T7           (Core week loop — sequential)
          ↓
     T8 → T9 → T10          (Export/import — sequential, critical path)
          ↓
     T11 → T12              (Notion sync — can start after T7)
     T13 → T14              (Charts — independent, can start after T2)
     T15 → T16 → T17        (Polish — can start after T10)
```

**Independent tracks after T2:**
- Charts (T13–T14) can be built in parallel with Notion sync (T11–T12)
- Polish (T15–T17) can start once core loop (T5–T10) is working

**Critical path:** T1 → T2 → T5 → T8 → T9 → T10 — this is the minimal viable loop (log sessions → export → import new plan).

---

## Key Decisions to Make During Implementation

| Decision | Options | Recommendation |
|----------|---------|----------------|
| shadcn/ui theme | Default / custom dark | Use `zinc` dark theme — closest to your HTML's `#0a0a0a` aesthetic |
| Notion page structure | Database with properties vs plain pages | Database with properties — allows structured pull-back of logged values |
| `lift_progression` in import | Always overwrite from Claude | Yes — Claude is the source of truth for progression decisions |
| Photo paths | Absolute Mac paths in JSON | Yes — user attaches manually to Claude; app just lists the paths |
| History limit | All weeks vs rolling N | Store all, only send last 4 in export (prevents Claude context overflow) |
| Port | 3000 (default) | Fine — no conflict expected |
