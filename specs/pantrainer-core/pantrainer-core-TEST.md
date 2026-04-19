---
name: PanTrainer Core — Test Strategy
description: Manual acceptance tests and contract validation cases derived from EARS requirements
type: project
---

## Testing Philosophy

This is a personal tool. No automated test suite. The testing strategy has two layers:

1. **Zod schema validation** — automated, built into the code. Every import is validated at runtime. This is the one non-negotiable safety net.
2. **Manual acceptance tests** — run these after each phase to confirm the critical path works before building the next layer.

The highest-risk surface is the **import/export contract**. If the JSON schema drifts between what the app exports and what Claude returns, the whole loop breaks. Every test below that touches import/export is critical.

---

## What NOT to Test

- React component rendering details (layout, colours, spacing)
- shadcn/ui component behaviour (not our code)
- Next.js routing and middleware
- Notion SDK internals
- File system read/write at the OS level

---

## Critical Path Tests (run these first, in order)

### TC-1: `new_week_carries_forward_lift_progression` → R3, R4
**Setup:** Archive a week with `lift_progression.deadlift_kg = 95`
**Action:** Trigger "New Week"
**Assert:** New week document has `lift_progression.deadlift_kg = 95`

### TC-2: `log_session_updates_week_summary` → R10, R15
**Setup:** Current week with all sessions in `planned` state
**Action:** Log Monday session with `duration_min: 45, avg_hr_bpm: 158, total_calories: 520`
**Assert:** `current-week.json` session for Monday has those values; `week_summary.total_calories` increases by 520

### TC-3: `skip_session_records_null_metrics` → R13
**Setup:** Current week, Wednesday session in `planned` state
**Action:** Mark Wednesday as skipped with note "Sick"
**Assert:** Session `status: "skipped"`, all metric fields null, notes contains "Sick"

### TC-4: `completed_session_is_immutable` → R27 (state invariant)
**Setup:** Monday session in `completed` state
**Action:** Attempt to overwrite Monday via `PATCH /api/session/monday`
**Assert:** API returns 409 or similar; session data unchanged

### TC-5: `export_includes_history_block` → R20, R23
**Setup:** 4 archived weeks + 1 active week with at least one completed session
**Action:** Trigger "Export Week"
**Assert:** Exported JSON has `history` array with 4 entries; each entry has `total_sessions`, `total_calories`, `strength_days`, `conditioning_days`, peak lift weights

### TC-6: `export_lists_photo_paths` → R22
**Setup:** Log a Conditioning session with `photos: ["/Users/panos/Photos/hyrox-apr-19.jpg"]`
**Action:** Trigger "Export Week"
**Assert:** Exported JSON has `photos_to_attach: ["/Users/panos/Photos/hyrox-apr-19.jpg"]`

### TC-7: `import_valid_json_creates_next_week` → R24, R25
**Setup:** Export file from TC-5; paste that JSON into import textarea
**Action:** Trigger "Import Plan"
**Assert:** New `current-week.json` created with correct week dates; `next_week_plan` populated; gym alternation advanced (A→B or B→A)

### TC-8: `import_invalid_json_shows_raw_fallback` → R26
**Setup:** Paste malformed JSON ("{ broken json }")
**Action:** Trigger "Import Plan"
**Assert:** App displays raw text in fallback view; `current-week.json` unchanged; no crash

### TC-9: `import_preserves_completed_sessions` → R27
**Setup:** Current week has Monday `completed`; import new plan
**Action:** Trigger "Import Plan" mid-week
**Assert:** Monday session data unchanged after import

---

## Contract Validation Tests (Zod layer — these run automatically on every import)

### TC-10: `schema_rejects_missing_required_fields` → R26
**Setup:** JSON missing `athlete.rhr_bpm`
**Assert:** Zod returns validation error; import aborted; error message shown to user

### TC-11: `schema_rejects_wrong_types` → R26
**Setup:** JSON with `duration_min: "forty-five"` (string instead of number)
**Assert:** Zod returns type error; import aborted

### TC-12: `schema_accepts_null_optional_fields` → R13 (skipped sessions)
**Setup:** Session with `duration_min: null, avg_hr_bpm: null, total_calories: null`
**Assert:** Zod accepts document; session written correctly

### TC-13: `schema_accepts_partial_lift_progression` → R1
**Setup:** `lift_progression` object with only 3 keys (not all lifts)
**Assert:** Zod accepts; app does not crash on missing keys

---

## Notion Sync Tests (run after T12)

### TC-14: `push_creates_seven_notion_pages` → R16
**Setup:** Valid current week, Notion credentials configured
**Action:** Trigger "Push to Notion"
**Assert:** 7 pages created in Notion database, each named by day; last sync timestamp updated in UI

### TC-15: `pull_merges_without_overwriting_completed` → R17
**Setup:** Monday `completed` locally; Notion page for Monday has different values
**Action:** Trigger "Pull from Notion"
**Assert:** Monday session unchanged locally; other days updated from Notion

### TC-16: `notion_failure_preserves_local_data` → R18
**Setup:** Invalid Notion token
**Action:** Trigger "Push to Notion"
**Assert:** Error toast shown; `current-week.json` unchanged; app does not crash

---

## Deload Counter Tests (run after T16)

### TC-17: `deload_banner_shown_at_week_4` → R6
**Setup:** `state.json` with `deloadCounter: 4`
**Action:** Load home page
**Assert:** Deload reminder banner visible

### TC-18: `deload_counter_resets_after_deload_week` → R8
**Setup:** `deloadCounter: 5`; user flags current week as deload; archive week
**Action:** Trigger "New Week"
**Assert:** `state.json` has `deloadCounter: 1`

---

## Offline Resilience Tests (run after T17)

### TC-19: `app_works_without_notion_credentials` → R31
**Setup:** `.env.local` has no `NOTION_TOKEN`
**Action:** Load app, log a session, export week
**Assert:** All actions succeed; Notion sync buttons are disabled (not erroring)

### TC-20: `app_works_without_internet` → R31
**Setup:** Disconnect Mac from internet (or block localhost outbound)
**Action:** Load home, log session, view progress charts
**Assert:** All non-Notion features work normally

---

## End-to-End Loop Test (run once all phases complete)

### TC-21: `full_weekly_loop`
**Setup:** Fresh install, athlete profile configured, one week of sessions logged
**Action sequence:**
1. Log 5 sessions across the week (mix of Conditioning, Strength, Recovery, one Skipped)
2. Export week → download JSON
3. Open JSON, verify structure matches schema
4. Paste JSON into Claude chat (manually) → receive Claude's response
5. Paste Claude's response into import textarea → trigger Import
6. Verify new week created with correct `next_week_plan` and updated `lift_progression`
7. Verify previous week archived in `data/weeks/`
8. Verify gym week alternated correctly
**Assert:** All 7 steps succeed with no manual corrections needed
