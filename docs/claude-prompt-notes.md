# Claude Prompt Notes

Instructions to include in your Claude chat prompt when requesting a weekly plan.

## muscle_groups field (added 2026-04-20)

Each session in the `sessions` array must include a `muscle_groups` field. Add this to your prompt:

```
Each session must include a "muscle_groups" field: an array of lowercase strings
from this exact list:
  chest, shoulders, triceps, biceps, forearms, back, lats, traps, core,
  glutes, quads, hamstrings, calves, full_body

Rules:
- Use full_body for HIIT, CrossFit, HYROX, or any full-body conditioning session
- Use [] (empty array) for Rest and Recovery days
- Always populate this field — never omit it
- Use multiple values when a session targets multiple groups (e.g. ["chest", "shoulders", "triceps"] for Push day)
```

## Session JSON structure

**IMPORTANT: Update the `date` fields to the actual dates for the week being planned.**
Monday always anchors the week. Example for the week of 2026-04-27:
- Monday 2026-04-27, Tuesday 2026-04-28, Wednesday 2026-04-29, Thursday 2026-04-30, Friday 2026-05-01, Saturday 2026-05-02, Sunday 2026-05-03

```json
{
  "date": "YYYY-MM-DD",
  "day": "Monday",
  "type": "Strength",
  "subtype": "Push — Chest / Shoulders / Triceps",
  "exercises": [],
  "duration_min": null,
  "avg_hr_bpm": null,
  "total_calories": null,
  "notes": "",
  "status": "planned",
  "photos": [],
  "muscle_groups": ["chest", "shoulders", "triceps"]
}
```
