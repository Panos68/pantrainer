---
name: PanTrainer Core — Spec
description: EARS requirements, state model, and contracts for the full PanTrainer v1 product
type: project
---

## Discovery Summary

See `pantrainer-core-DISCOVER.md` for full discovery output.

---

## Exchange Format (Claude ↔ App)

The canonical data format is JSON. Claude already produces this schema. The app reads and writes it. Every export sends this JSON to Claude chat; every import ingests Claude's returned JSON.

```json
{
  "week": "Apr 14–20, 2026",
  "athlete": {
    "name": "Panos",
    "age": 33,
    "weight_kg": 73.7,
    "smm_kg": 35.2,
    "bf_pct": 15.6,
    "bmr_kcal": 1713,
    "rhr_bpm": 43,
    "smm_target_kg": 37
  },
  "sessions": [
    {
      "date": "2026-04-14",
      "day": "Monday",
      "type": "Strength | Conditioning | Recovery | Rest",
      "subtype": "free text",
      "duration_min": null,
      "avg_hr_bpm": null,
      "total_calories": null,
      "notes": "free text"
    }
  ],
  "week_summary": {
    "total_sessions": 0,
    "high_output_days": 0,
    "strength_days": 0,
    "recovery_days": 0,
    "total_calories": 0,
    "notes": "free text"
  },
  "lift_progression": {
    "bench_press_kg": 70,
    "bench_status": "free text",
    "deadlift_kg": 95,
    "deadlift_next": 100
  },
  "health_flags": [
    {
      "flag": "label",
      "location": "optional",
      "status": "free text",
      "training_impact": "free text",
      "action": "free text"
    }
  ],
  "next_week_plan": {
    "monday": "free text",
    "tuesday": "free text",
    "wednesday": "free text",
    "thursday": "free text",
    "friday": "free text",
    "saturday": "free text",
    "sunday": "free text",
    "notes": "free text"
  }
}
```

---

## EARS Requirements

### Plan & Data Management

**R1:** The app shall store the current week's JSON document as the single source of truth for the active week's plan, sessions, lift progression, and health flags.

**R2:** The app shall track the gym session alternation state (Week A: Pull/Posterior, Week B: Push/Shoulders) and display it prominently in the UI.

**R3:** When a new week begins, the app shall pre-populate the new week's session stubs from the `next_week_plan` field of the previous week's JSON.

**R4:** When a new week begins, the app shall pre-populate the `lift_progression` object from the previous week's `lift_progression`, carrying forward all weights and status notes.

**R5:** The app shall carry all active `health_flags` forward into every export until the user explicitly clears them.

**R6:** When the deload counter reaches 4 weeks since the last deload, the app shall display a deload reminder banner.

**R7:** When the deload counter reaches 5 weeks since the last deload, the app shall prompt the user to flag the current week as a deload.

**R8:** When the user flags a week as a deload, the app shall include a deload indicator in the export and reset the deload counter to 1 after that week is archived.

### Session Logging

**R9:** When a user opens a session to log, the app shall pre-fill the session with the guidance text from `next_week_plan` for that day.

**R10:** When a user saves a session log, the app shall record: date, day, type, subtype, duration, average HR, total calories, and notes — matching the JSON session schema.

**R11:** When logging a gym session, the app shall provide a notes field pre-filled with the relevant lifts and weights from `lift_progression` so the user can record achieved values inline.

**R12:** When logging a Conditioning session, the app shall allow the user to attach one or more local photo file paths to the session record.

**R13:** When a user marks a session as skipped, the app shall record the session with null metrics and a skip note in the notes field.

**R14:** While a session is being logged, the app shall allow saving a partial log without marking the session as complete.

**R15:** When a session log is saved as complete, the app shall automatically recalculate the `week_summary` totals.

### Notion Sync

**R16:** When the user triggers "Push to Notion", the app shall create or update one Notion page per day in the current week, displaying the `next_week_plan` guidance and a blank log template.

**R17:** When the user triggers "Pull from Notion", the app shall read session data entered on phone from each day's Notion page and merge it into the local session records.

**R18:** If a Notion API call fails, then the app shall display an error, preserve all local data unchanged, and allow the user to retry.

**R19:** The app shall display the timestamp of the last successful Notion sync.

### Weekly Export

**R20:** When the user triggers "Export Week", the app shall generate the complete week JSON document, including: athlete profile, all logged sessions, week summary, lift progression, health flags, and a rolling 4-week performance summary block appended as `history`.

**R21:** The app shall save each export to `exports/week-YYYY-WW.json`.

**R22:** When a session has attached photo paths, the export shall include a top-level `photos_to_attach` array listing those paths, so the user knows which images to attach to the Claude chat message.

**R23:** The rolling 4-week summary (`history`) shall include: per-week session count, total calories, strength days, conditioning days, and a list of peak achieved weights from `lift_progression` for each week.

### Weekly Import

**R24:** When the user pastes a Claude response JSON and triggers "Import Plan", the app shall validate and apply it as the next week's base document.

**R25:** When importing, the app shall advance the gym alternation state (A→B or B→A) based on the `next_week_plan` Wednesday entry, unless the user overrides it manually.

**R26:** If the import JSON fails schema validation, then the app shall display the raw text and allow the user to manually correct or override individual fields.

**R27:** When importing, the app shall not overwrite session data for any day in the current week that already has logged metrics.

### Progress Tracking

**R28:** The app shall maintain a permanent local history of all archived week JSON documents.

**R29:** The app shall display a progress chart for key lifts (bench, deadlift, pull-ups weight, OHP) showing peak achieved weight per week over time, sourced from `lift_progression` history.

**R30:** The app shall display a conditioning trend chart showing average HR and total calories per conditioning session over time.

### System Constraints

**R31:** The app shall function fully for session logging, plan viewing, and progress charts without an internet connection.

**R32:** The app shall not require any paid service, hosting, or subscription beyond the user's existing Claude.ai account.

---

## State Model

### Session States

| State | Description | Observable |
|-------|-------------|------------|
| `planned` | Day exists, not yet logged | Shows `next_week_plan` guidance text |
| `in_progress` | Partial log saved | Shows partial metrics, not yet in week_summary |
| `completed` | Fully logged | Metrics recorded, week_summary updated |
| `skipped` | Marked as skipped | Null metrics, note recorded |

**Transitions:**
- `planned` → `in_progress` (partial save)
- `planned` → `completed` (full save)
- `planned` → `skipped` (user marks skip)
- `in_progress` → `completed` (user finalises)
- `in_progress` → `skipped` (user marks skip)

**Impossible:**
- `completed` → any other state (immutable)
- `skipped` → any other state (immutable)

### Week States

| State | Description |
|-------|-------------|
| `active` | Current week, sessions being logged |
| `exported` | Export JSON generated |
| `archived` | Import completed, week stored in history |

**Invariant:** Exactly one week is in `active` state at all times.

### Gym Alternation

| State | Wednesday |
|-------|-----------|
| `week_a` | Pull + Posterior |
| `week_b` | Push + Shoulders |
| `legs_week` | Legs day (monthly override, reverts after one week) |

**Transitions:** `week_a` ↔ `week_b` on each import.

### Deload Counter

- Integer 1–5, increments each week on archive
- Resets to 1 after a deload week is archived
- At 4: reminder shown. At 5: prompt shown.
- **Invariant:** Counter never exceeds 5 without a prompt being shown

---

## Contracts

### Operation: `exportWeek`

**Preconditions:**
- Current week is `active` or `exported`
- At least one session is `completed` or `skipped`

**Postconditions (success):**
- `exports/week-YYYY-WW.json` written and valid
- `history` block appended with up to 4 prior weeks
- `photos_to_attach` array populated if any sessions have photo paths
- Week state advances to `exported`

**Postconditions (failure):**
- No file written (or partial file deleted)
- Week state unchanged

---

### Operation: `importPlan`

**Preconditions:**
- User has provided non-empty JSON text

**Postconditions (success):**
- New week document created with `next_week_plan`, `lift_progression`, `health_flags` from imported JSON
- Gym alternation state advanced
- Deload counter incremented (or reset)
- Current week archived

**Postconditions (failure):**
- Current plan and history unchanged
- Raw text shown for manual review

---

### Operation: `logSession`

**Preconditions:**
- Session exists in current week
- Session state is `planned` or `in_progress`

**Postconditions (success):**
- Session state updated to `completed` or `in_progress`
- All provided fields written to the week JSON
- `week_summary` recalculated if `completed`
- Notion sync queued if configured

**Postconditions (failure):**
- Session reverts to previous state
- No partial write persisted

---

## Anti-Requirements

- The app does **not** call the Claude API — interaction is always manual chat.
- The app does **not** provide a native iOS interface — phone access is Notion only.
- The app does **not** include morning check-in or readiness tracking in v1 (deferred to Garmin MCP).
- The app does **not** include Garmin integration in v1.
- The app does **not** perform OCR on HYROX photos.
- The app does **not** require authentication or user accounts.
- The app does **not** require any paid services beyond the user's Claude.ai subscription.

---

## Dependencies

- [ ] Notion account (free tier) with API integration token configured
- [ ] Initial `lift_progression` data entered (baseline weights from existing plan)
- [ ] Initial `athlete` profile data entered
- [ ] Local `exports/` directory writable

---

## Open Questions

- [x] **OQ1:** Morning check-in → removed from v1. Deferred to Garmin MCP.
- [x] **OQ2:** Exchange format → JSON (matching Claude's existing output schema).
- [ ] **OQ3:** Claude response format instructions → define in export template (deferred to plan phase).

---

## Change Log

- **2026-04-19** Initial spec created.
- **2026-04-19** Removed morning check-in (R13/R14/R15) per OQ1. Exchange format changed from Markdown to JSON per OQ2. Added `health_flags`, `lift_progression`, and `next_week_plan` as first-class data structures based on Claude's existing output schema.
