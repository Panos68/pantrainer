import { blobUrl } from '@/lib/blob-url'
import { list } from '@vercel/blob'
import { signPhotoUrl } from '@/app/api/photos/route'
import {
  readCurrentWeekDirect,
  readAutomationNotes,
  readProposedPlan,
  writeProposedPlan,
  readArchivedWeeks,
  readAllArchivedWeeks,
  writeNutritionLogEntry,
  readNutritionLogForRange,
  readFoodNotesForRange,
  readPantry,
  seedPantryIfEmpty,
} from '@/lib/data'
import { formatPantryBrief } from '@/lib/pantry-brief'
import { buildExportV2 } from '@/lib/export'
import { validateImport } from '@/lib/import'
import { todayIsoInAppTimeZone, formatTimeInAppTimeZone } from '@/lib/app-timezone'
import { SessionSchema, ProposedPlanRunTypeSchema } from '@/lib/schema'
import type { WeekDoc, NutritionLogEntry } from '@/lib/schema'

// ---------------------------------------------------------------------------
// MCP tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_current_week',
    description:
      'Fetch the current training week export (v2 coach context), automation notes/rules, and the latest proposed plan draft (if any).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'submit_proposed_plan',
    description:
      'Submit a proposed full-week plan. The athlete will review it in the app before applying. Provide the complete week_doc JSON as a string.',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          type: 'string',
          description: 'Either full week_doc JSON or { "week_doc": ..., "analysis_text": "..." }.',
        },
        source: { type: 'string', description: 'Label for the source (default: cowork).' },
        run_type: {
          type: 'string',
          enum: ['manual', 'daily', 'weekly'],
          description: 'Type of planning run.',
        },
        analysis_text: {
          type: 'string',
          description: 'Optional plain-text week analysis written by Claude for the athlete.',
        },
      },
      required: ['json'],
    },
  },
  {
    name: 'submit_proposal_by_date',
    description:
      'Submit a proposed update for a single session on an explicit date. Merges into the current week (that one session only — every other day is left untouched) and stores as a proposed plan for review. target_date is required (no "today" default) to avoid timezone-driven date mixups; always pass the exact YYYY-MM-DD date of the session you mean to change.',
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'object',
          description: 'Session object matching the SessionSchema.',
        },
        target_date: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) of the session to update. Required.',
        },
        source: { type: 'string' },
        run_type: { type: 'string', enum: ['manual', 'daily', 'weekly'] },
        analysis_text: { type: 'string' },
      },
      required: ['session', 'target_date'],
    },
  },
  {
    name: 'get_garmin_recovery_freshness',
    description:
      'Check whether cached Garmin recovery data for a given date is actually present and current, before using it to give advice. Returns sleep, resting/max HR, Body Battery, Stress, VO2 max, and Fitness Age (whichever are cached), the recovery score breakdown is NOT included here — use the score directly from the week doc if needed. Includes an explicit warning when data is missing or stale, a same_day flag, and a per-field field_warnings object distinguishing "not synced yet", "Garmin genuinely has no data for this field on this date" (e.g. VO2 max is only recomputed periodically, not daily), and — for Body Battery/Stress specifically when same_day is true — "still accumulating, not a final total yet" (sleep/RHR are overnight-derived and already final by morning, so this third case never applies to them). Use this before trusting any of these numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD) to check. Required.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_lift_history',
    description:
      'Get the history of actual weight/reps/effort logged for a specific exercise name across completed strength sessions (current week + archived weeks). Matches the exercise name exactly (case-insensitive) to avoid confusing similarly-named lifts (e.g. Pendlay row vs tricep extension); also reports other exercise names it found that partially match, so you can catch a wrong name before drawing conclusions.',
    inputSchema: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Exact exercise name to look up. Required.' },
        weeks_back: {
          type: 'number',
          description: 'Limit to the N most recent archived weeks (plus current week). Omit to scan all archived weeks.',
        },
      },
      required: ['exercise_name'],
    },
  },
  {
    name: 'list_food_photos_for_range',
    description:
      'Fetch food photos and any written food notes for an inclusive date range so they can be analyzed for approximate calorie/macro content. Returns each photo as an inline image labeled with the date AND local time it was uploaded (e.g. "Date: 2026-08-28, uploaded 08:15") — use that real time to label meals in save_nutrition_estimate\'s optional per-meal breakdown (e.g. a photo uploaded 07:xx-09:xx is very likely breakfast, 12:xx-14:xx likely lunch, 18:xx-20:xx likely dinner, anything clearly outside those windows is more likely a snack) rather than guessing the meal type purely from what the food looks like. If the upload time doesn\'t clearly indicate a specific meal, use a neutral label like "Snack" or "Meal (unclear time)" instead of forcing it into breakfast/lunch/dinner. Also returns any freeform notes the athlete typed directly in the app describing what they ate (an alternative to photographing everything) — these have no per-item time, so anchor their content to the day generally. Also returns pantry_brief: the athlete\'s staple foods with their exact per-100g macros, usual portion sizes, and visual descriptions — ALWAYS apply this before estimating, since several staples (kvarg in particular) are visually ambiguous and have previously been misidentified as milk or yogurt, which is wrong on both calories and protein. Use this when the athlete asks about their eating/calories for a period — there is no separate calorie database yet, so photos and notes are the only sources; if neither is found for the range, say so rather than guessing.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive start of range. Required.' },
        end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive end of range. Required.' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'save_nutrition_estimate',
    description:
      'Save a calorie/macro estimate for a specific day, whether derived from analyzing food photos (list_food_photos_for_range) or from a plain-text description the athlete gave in chat (e.g. "had kvarg and granola for breakfast"). Before estimating from text, check recent entries via get_nutrition_summary_for_range for a similar description and anchor to that prior estimate so repeat meals stay consistent rather than drifting each time. Re-saving a date overwrites the previous estimate for that date — when re-analyzing a day flagged stale by get_nutrition_summary_for_range, re-look at ALL of that day\'s photos/notes and save one fresh whole-day total (do not try to add just the new item to the old saved total).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD) this estimate is for. Required.' },
        calories: { type: 'number', description: 'Estimated total calories for the day. Required.' },
        protein: { type: 'number', description: 'Estimated grams of protein for the day.' },
        carbs: { type: 'number', description: 'Estimated grams of carbs for the day.' },
        fat: { type: 'number', description: 'Estimated grams of fat for the day.' },
        description: { type: 'string', description: 'Brief description of what was eaten. Required.' },
        meals: {
          type: 'array',
          description: 'Optional per-meal breakdown (e.g. one entry per Breakfast/Lunch/Dinner/Snack) — the day-level calories/protein/carbs/fat above still apply as the whole-day total regardless of whether this is provided.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Meal label, e.g. "Breakfast". Required.' },
              calories: { type: 'number', description: 'Estimated calories for this meal. Required.' },
              protein: { type: 'number', description: 'Estimated grams of protein for this meal.' },
              carbs: { type: 'number', description: 'Estimated grams of carbs for this meal.' },
              fat: { type: 'number', description: 'Estimated grams of fat for this meal.' },
              items: {
                type: 'array',
                description: 'Optional per-item breakdown of this meal. Include it whenever you can identify individual foods, and ALWAYS for pantry staples — recording grams is what lets the athlete\'s usual portions be refined from real history later.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Food name, e.g. "Kvarg". Required.' },
                    grams: { type: 'number', description: 'Estimated weight in grams. Required.' },
                    calories: { type: 'number', description: 'Calories for this item. Required.' },
                    pantry_id: { type: 'string', description: 'The staple\'s id from pantry_brief (e.g. "kvarg"). Omit for a one-off food such as a restaurant meal.' },
                  },
                  required: ['name', 'grams', 'calories'],
                },
              },
            },
            required: ['name', 'calories'],
          },
        },
      },
      required: ['date', 'calories', 'description'],
    },
  },
  {
    name: 'get_nutrition_summary_for_range',
    description:
      'Get a cheap summary of saved nutrition estimates for a date range (e.g. "this week", "last 10 days") without re-analyzing any photos. Returns each day\'s saved calories/macros/meals/description, a total and average, plus two lists of dates needing attention: gap_dates (photos/notes exist but no saved estimate at all yet) and stale_dates (a saved estimate exists, but a photo or note for that date was added/edited AFTER it was saved — e.g. a dinner photo added after breakfast/lunch were already analyzed). For any date in either list, call list_food_photos_for_range for just that date, re-look at ALL of that day\'s photos/notes together (not just the new item), and call save_nutrition_estimate to save one fresh whole-day total — never try to add just the new item on top of the old saved number, since that risks double-counting.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive start of range. Required.' },
        end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive end of range. Required.' },
      },
      required: ['start_date', 'end_date'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

// Note: base64 embedding was previously reverted due to SSE polling causing 83 GB-Hrs in 2 days.
// The SSE polling is now fixed (GET returns 405), so base64 is safe to use again.
async function fetchPhotoAsBase64(pathname: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) return null
    const res = await fetch(blobUrl(pathname), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim()
    const buffer = await res.arrayBuffer()
    const data = Buffer.from(buffer).toString('base64')
    return { data, mimeType }
  } catch {
    return null
  }
}

async function matchFoodPhotoBlobsForRange(startDate: string, endDate: string, token: string) {
  const { blobs } = await list({ prefix: 'data/food-photos/', token })
  return blobs
    .map((b) => {
      const parts = b.pathname.split('/')
      const date = parts[2] ?? ''
      return { pathname: b.pathname, date, uploadedAt: b.uploadedAt as Date }
    })
    .filter((b) => b.date >= startDate && b.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function handleListFoodPhotosForRange(args: Record<string, unknown>) {
  const startDate = args.start_date
  const endDate = args.end_date
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    return { error: 'start_date and end_date are required ISO date strings' }
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return { error: 'BLOB_READ_WRITE_TOKEN is not configured' }
  }

  await seedPantryIfEmpty()

  const [matches, notes, pantry] = await Promise.all([
    matchFoodPhotoBlobsForRange(startDate, endDate, token),
    readFoodNotesForRange(startDate, endDate),
    readPantry(),
  ])

  const noteSummaries = notes.map((n) => ({ date: n._id, text: n.text }))
  const pantryBrief = formatPantryBrief(pantry)

  if (matches.length === 0) {
    return {
      summary:
        noteSummaries.length > 0
          ? `No food photos found between ${startDate} and ${endDate}, but ${noteSummaries.length} written note(s) exist.`
          : `No food photos or notes found between ${startDate} and ${endDate}.`,
      photos: [],
      notes: noteSummaries,
      pantry_brief: pantryBrief,
    }
  }

  const photos = await Promise.all(
    matches.map(async (m) => ({
      date: m.date,
      time: formatTimeInAppTimeZone(m.uploadedAt),
      photo: await fetchPhotoAsBase64(m.pathname),
    })),
  )

  return {
    summary: `Found ${matches.length} food photo(s) and ${noteSummaries.length} written note(s) between ${startDate} and ${endDate}.`,
    photos: photos.filter((p): p is { date: string; time: string; photo: { data: string; mimeType: string } } => p.photo !== null),
    notes: noteSummaries,
    pantry_brief: pantryBrief,
  }
}

async function handleSaveNutritionEstimate(args: Record<string, unknown>) {
  const date = args.date
  const calories = args.calories
  const description = args.description
  if (typeof date !== 'string' || typeof calories !== 'number' || typeof description !== 'string') {
    return { error: 'date (string), calories (number), and description (string) are required' }
  }

  const macros: NonNullable<NutritionLogEntry['macros']> = {}
  if (typeof args.protein === 'number') macros.protein = args.protein
  if (typeof args.carbs === 'number') macros.carbs = args.carbs
  if (typeof args.fat === 'number') macros.fat = args.fat

  const rawMeals = Array.isArray(args.meals) ? args.meals : []
  const meals: NonNullable<NutritionLogEntry['meals']> = rawMeals
    .filter(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null && typeof (m as Record<string, unknown>).name === 'string' && typeof (m as Record<string, unknown>).calories === 'number',
    )
    .map((m) => {
      const mealMacros: NonNullable<NutritionLogEntry['macros']> = {}
      if (typeof m.protein === 'number') mealMacros.protein = m.protein
      if (typeof m.carbs === 'number') mealMacros.carbs = m.carbs
      if (typeof m.fat === 'number') mealMacros.fat = m.fat
      // Same omit-don't-undefine rule as the entry below: an `items: undefined`
      // round-trips through Mongo as null and fails the schema on read.
      const rawItems = Array.isArray(m.items) ? m.items : []
      const items = rawItems
        .filter(
          (it): it is Record<string, unknown> =>
            typeof it === 'object' && it !== null &&
            typeof (it as Record<string, unknown>).name === 'string' &&
            typeof (it as Record<string, unknown>).grams === 'number' &&
            typeof (it as Record<string, unknown>).calories === 'number',
        )
        .map((it) => ({
          name: it.name as string,
          grams: it.grams as number,
          calories: it.calories as number,
          pantryId: typeof it.pantry_id === 'string' ? it.pantry_id : null,
        }))
      return {
        name: m.name as string,
        calories: m.calories as number,
        ...(Object.keys(mealMacros).length > 0 ? { macros: mealMacros } : {}),
        ...(items.length > 0 ? { items } : {}),
      }
    })

  const entry: NutritionLogEntry = {
    _id: date,
    estimatedCalories: calories,
    // Omit keys entirely rather than setting them to undefined — the MongoDB
    // driver serializes an undefined field value as BSON null, not as an
    // absent key, which the schema's .optional() (not .nullable()) rejects on read.
    ...(Object.keys(macros).length > 0 ? { macros } : {}),
    ...(meals.length > 0 ? { meals } : {}),
    description,
    analyzedAt: new Date().toISOString(),
  }

  await writeNutritionLogEntry(entry)
  return { saved: true, date }
}

async function handleGetNutritionSummaryForRange(args: Record<string, unknown>) {
  const startDate = args.start_date
  const endDate = args.end_date
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    return { error: 'start_date and end_date are required ISO date strings' }
  }

  const entries = await readNutritionLogForRange(startDate, endDate)
  const entryByDate = new Map(entries.map((e) => [e._id, e]))

  let gapDates: string[] = []
  let staleDates: string[] = []
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    const [photoMatches, notes] = await Promise.all([
      matchFoodPhotoBlobsForRange(startDate, endDate, token),
      readFoodNotesForRange(startDate, endDate),
    ])

    // Latest content timestamp per date, across both photos and notes.
    const latestContentByDate = new Map<string, number>()
    for (const p of photoMatches) {
      const ts = new Date(p.uploadedAt).getTime()
      latestContentByDate.set(p.date, Math.max(latestContentByDate.get(p.date) ?? 0, ts))
    }
    for (const n of notes) {
      const ts = new Date(n.updatedAt).getTime()
      latestContentByDate.set(n._id, Math.max(latestContentByDate.get(n._id) ?? 0, ts))
    }

    for (const [date, latestTs] of latestContentByDate) {
      const entry = entryByDate.get(date)
      if (!entry) {
        gapDates.push(date)
      } else if (latestTs > new Date(entry.analyzedAt).getTime()) {
        staleDates.push(date)
      }
    }
    gapDates.sort()
    staleDates.sort()
  }

  const totalCalories = entries.reduce((sum, e) => sum + e.estimatedCalories, 0)
  const avgCalories = entries.length > 0 ? Math.round(totalCalories / entries.length) : null

  return {
    summary:
      entries.length > 0
        ? `${entries.length} logged day(s) between ${startDate} and ${endDate}, avg ${avgCalories} cal/day.`
        : `No saved nutrition estimates between ${startDate} and ${endDate}.`,
    entries: entries.map((e) => ({
      date: e._id,
      calories: e.estimatedCalories,
      macros: e.macros ?? null,
      meals: e.meals ?? null,
      description: e.description,
    })),
    total_calories: totalCalories,
    avg_calories: avgCalories,
    gap_dates: gapDates,
    stale_dates: staleDates,
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pantrainer.vercel.app'

async function handleGetCurrentWeek() {
  const currentWeek = await readCurrentWeekDirect()
  if (!currentWeek) {
    return { error: 'No current week found' }
  }
  const [payload, notes, proposed] = await Promise.all([
    buildExportV2(currentWeek),
    readAutomationNotes(),
    readProposedPlan(),
  ])

  const photoPathnames: string[] = payload.photos_to_attach ?? []
  const photoUrls = photoPathnames.map((p) => signPhotoUrl(APP_URL, p))
  const photoBase64 = await Promise.all(photoPathnames.map((p) => fetchPhotoAsBase64(p)))

  return {
    export_v2: payload,
    automation_notes: notes,
    proposed_plan: proposed
      ? {
          created_at: proposed.created_at,
          source: proposed.source,
          run_type: proposed.run_type,
          notes_version: proposed.notes_version,
          analysis_text: proposed.analysis_text,
          week_doc: proposed.week_doc,
        }
      : null,
    photoUrls,
    photoBase64: photoBase64.filter((p): p is { data: string; mimeType: string } => p !== null),
  }
}

async function handleSubmitProposedPlan(args: Record<string, unknown>) {
  const json = args.json
  if (typeof json !== 'string' || json.trim().length === 0) {
    return { ok: false, error: 'Missing json' }
  }

  const result = validateImport(json)
  if (!result.ok) {
    return { ok: false, errors: result.errors }
  }

  const notes = await readAutomationNotes()
  const source = typeof args.source === 'string' ? args.source : 'cowork'
  const runTypeParsed = ProposedPlanRunTypeSchema.safeParse(args.run_type)
  const run_type = runTypeParsed.success ? runTypeParsed.data : 'manual'
  const analysis_text =
    typeof args.analysis_text === 'string'
      ? args.analysis_text
      : result.analysis_text

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    analysis_text,
    raw_json: json,
    week_doc: result.data,
  })

  return { ok: true, source, run_type, analysis_text }
}

async function handleSubmitProposalByDate(args: Record<string, unknown>) {
  const sessionParsed = SessionSchema.safeParse(args.session)
  if (!sessionParsed.success) {
    return {
      ok: false,
      error: 'Invalid session',
      errors: sessionParsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    }
  }

  const targetDate = args.target_date
  if (typeof targetDate !== 'string' || targetDate.trim().length === 0) {
    return { ok: false, error: 'target_date is required (YYYY-MM-DD)' }
  }

  const currentWeek = await readCurrentWeekDirect()
  if (!currentWeek) {
    return { ok: false, error: 'No current week found' }
  }

  const targetIndex = currentWeek.sessions.findIndex((s) => s.date === targetDate)
  if (targetIndex === -1) {
    return {
      ok: false,
      error: `No session found for ${targetDate}`,
      available_dates: currentWeek.sessions.map((s) => `${s.date} (${s.day})`),
    }
  }

  const existing = currentWeek.sessions[targetIndex]
  if (existing.status === 'completed' || existing.status === 'skipped') {
    return { ok: false, error: `${existing.day} is already finalized` }
  }

  const normalizedSession = {
    ...sessionParsed.data,
    day: existing.day,
    date: existing.date,
    status: existing.status,
  }

  const proposedWeek = {
    ...currentWeek,
    sessions: currentWeek.sessions.map((s, i) => (i === targetIndex ? normalizedSession : s)),
  }

  const notes = await readAutomationNotes()
  const source = typeof args.source === 'string' ? args.source : 'cowork'
  const runTypeParsed = ProposedPlanRunTypeSchema.safeParse(args.run_type)
  const run_type = runTypeParsed.success ? runTypeParsed.data : 'daily'
  const analysis_text = typeof args.analysis_text === 'string' ? args.analysis_text : null

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    analysis_text,
    raw_json: JSON.stringify(proposedWeek, null, 2),
    week_doc: proposedWeek,
  })

  return {
    ok: true,
    target_day: existing.day,
    target_date: existing.date,
    source,
    run_type,
    analysis_text,
  }
}

async function handleGetGarminRecoveryFreshness(args: Record<string, unknown>) {
  const date = args.date
  if (typeof date !== 'string' || date.trim().length === 0) {
    return { ok: false, error: 'date is required (YYYY-MM-DD)' }
  }

  const currentWeek = await readCurrentWeekDirect()
  if (!currentWeek) {
    return { ok: false, error: 'No current week found' }
  }

  const recovery = currentWeek.garmin_recovery?.[date] ?? null
  const serverNow = new Date()
  const fetchedHoursAgo =
    recovery?.fetched_at != null
      ? Math.round((serverNow.getTime() - new Date(recovery.fetched_at).getTime()) / (1000 * 60 * 60) * 10) / 10
      : null

  let warning: string | null = null
  if (!recovery) {
    warning = `No Garmin recovery data cached yet for ${date}. Don't assume poor recovery — it's simply unavailable, likely not synced yet.`
  } else if (recovery.sleep_hours == null) {
    warning = `Sleep hours are missing for ${date} (resting_hr_bpm may still be present). Likely not synced yet — don't infer poor sleep from this.`
  } else if (fetchedHoursAgo != null && fetchedHoursAgo > 12) {
    warning = `Cached data for ${date} was fetched ${fetchedHoursAgo}h ago. If this is today, it may predate a later sync — treat with caution.`
  }

  // Per-field freshness distinction: when the whole day was never synced, every
  // extended field is "not synced yet". When the day WAS synced but a specific
  // field is null, that means Garmin genuinely has no data for it (e.g. watch
  // wasn't worn for Body Battery/Stress, or VO2 max simply wasn't recomputed on
  // its slow cadence) — a different situation from staleness, and must not be
  // read as a bad signal.
  function fieldWarning(fieldName: string, value: number | null | undefined, notRecordedReason: string): string | null {
    if (!recovery) {
      return `${fieldName} not synced yet for ${date}.`
    }
    if (value == null) {
      return `No ${fieldName} recorded for ${date} — ${notRecordedReason}. This is not a sync issue.`
    }
    return null
  }

  // Body Battery and Stress are cumulative, waking-hours metrics — same-day
  // values are a live snapshot of the day so far, not a final total. Sleep/RHR
  // are overnight-derived and already final by morning even on the current
  // day, so this caveat must not apply to them (or to VO2 max/Fitness Age,
  // which aren't computed daily at all).
  // Compared in APP_TIMEZONE, not UTC — a UTC comparison would misjudge
  // "today" near midnight the same way the old submit_today_session bug did.
  const isSameDay = date === todayIsoInAppTimeZone()
  const sameDayCaveat = (fieldName: string) =>
    `This date is still in progress — ${fieldName} is a cumulative/point-in-time metric that will keep changing until the day ends. Current value reflects the day so far, not a final total.`

  const field_warnings = {
    body_battery:
      fieldWarning('Body Battery', recovery?.body_battery_charged, 'likely the watch wasn\'t worn that day') ??
      (isSameDay && recovery?.body_battery_charged != null ? sameDayCaveat('Body Battery') : null),
    stress:
      fieldWarning('Stress', recovery?.avg_stress_level, 'likely the watch wasn\'t worn that day') ??
      (isSameDay && recovery?.avg_stress_level != null ? sameDayCaveat('Stress') : null),
    vo2max: fieldWarning('VO2 max', recovery?.vo2max, 'Garmin only recomputes this periodically, not every day'),
    fitness_age: fieldWarning('Fitness Age', recovery?.fitness_age, 'Garmin only recomputes this periodically, not every day'),
  }

  return {
    ok: true,
    date,
    same_day: isSameDay,
    found: recovery !== null,
    sleep_hours: recovery?.sleep_hours ?? null,
    deep_sleep_hours: recovery?.deep_sleep_hours ?? null,
    rem_sleep_hours: recovery?.rem_sleep_hours ?? null,
    resting_hr_bpm: recovery?.resting_hr_bpm ?? null,
    max_hr_bpm: recovery?.max_hr_bpm ?? null,
    body_battery_charged: recovery?.body_battery_charged ?? null,
    body_battery_drained: recovery?.body_battery_drained ?? null,
    avg_stress_level: recovery?.avg_stress_level ?? null,
    max_stress_level: recovery?.max_stress_level ?? null,
    vo2max: recovery?.vo2max ?? null,
    fitness_age: recovery?.fitness_age ?? null,
    achievable_fitness_age: recovery?.achievable_fitness_age ?? null,
    fetched_at: recovery?.fetched_at ?? null,
    fetched_hours_ago: fetchedHoursAgo,
    server_now: serverNow.toISOString(),
    warning,
    field_warnings,
  }
}

function matchesExerciseName(name: string, query: string): 'exact' | 'partial' | 'none' {
  const a = name.trim().toLowerCase()
  const b = query.trim().toLowerCase()
  if (a === b) return 'exact'
  if (a.includes(b) || b.includes(a)) return 'partial'
  return 'none'
}

async function handleGetLiftHistory(args: Record<string, unknown>) {
  const exerciseName = args.exercise_name
  if (typeof exerciseName !== 'string' || exerciseName.trim().length === 0) {
    return { ok: false, error: 'exercise_name is required' }
  }

  const weeksBack = typeof args.weeks_back === 'number' ? args.weeks_back : null

  const [currentWeek, archivedWeeks] = await Promise.all([
    readCurrentWeekDirect(),
    weeksBack ? readArchivedWeeks(weeksBack) : readAllArchivedWeeks(),
  ])

  const allWeeks: WeekDoc[] = [...archivedWeeks, ...(currentWeek ? [currentWeek] : [])]

  const history: Array<{
    date: string
    day: string
    weight_kg: number | null
    reps: number | string | null
    effort: 'easy' | 'perfect' | 'hard' | null
    notes: string | null
  }> = []
  const otherNamesSeen = new Set<string>()

  for (const week of allWeeks) {
    for (const session of week.sessions) {
      if (session.status !== 'completed' || session.type !== 'Strength') continue
      for (const ex of session.exercises) {
        const match = matchesExerciseName(ex.name, exerciseName)
        if (match === 'exact') {
          history.push({
            date: session.date,
            day: session.day,
            weight_kg: ex.actual_weight_kg ?? ex.weight_kg ?? null,
            reps: ex.actual_reps ?? ex.reps ?? null,
            effort: ex.effort ?? null,
            notes: ex.actual_note ?? null,
          })
        } else if (match === 'partial') {
          otherNamesSeen.add(ex.name)
        }
      }
    }
  }

  history.sort((a, b) => a.date.localeCompare(b.date))

  return {
    ok: true,
    exercise_name: exerciseName,
    history,
    other_similar_exercises: [...otherNamesSeen],
  }
}

// ---------------------------------------------------------------------------
// MCP request dispatch
// ---------------------------------------------------------------------------

type McpRequest =
  | { jsonrpc: '2.0'; id: string | number; method: 'initialize'; params: Record<string, unknown> }
  | { jsonrpc: '2.0'; id: string | number; method: 'tools/list'; params?: unknown }
  | { jsonrpc: '2.0'; id: string | number; method: 'tools/call'; params: { name: string; arguments?: Record<string, unknown> } }
  | { jsonrpc: '2.0'; id: string | number; method: string; params?: unknown }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

function mcpResult(id: string | number, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result }, { headers: CORS_HEADERS })
}

function mcpError(id: string | number | null, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers: CORS_HEADERS })
}

async function dispatch(req: McpRequest): Promise<Response> {
  // Notifications have no id — return 202 Accepted with no body
  if (!('id' in req) || req.id === undefined || req.id === null) {
    return new Response(null, { status: 202, headers: CORS_HEADERS })
  }

  const { id, method } = req

  if (method === 'initialize') {
    const sessionId = crypto.randomUUID()
    const body = {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'pantrainer', version: '1.0.0' },
    }
    return Response.json(
      { jsonrpc: '2.0', id, result: body },
      { headers: { ...CORS_HEADERS, 'Mcp-Session-Id': sessionId } },
    )
  }

  if (method === 'tools/list') {
    return mcpResult(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = (req as Extract<McpRequest, { method: 'tools/call' }>).params

    try {
      if (name === 'get_current_week') {
        const result = await handleGetCurrentWeek()
        if ('error' in result) {
          return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
        }
        const { photoUrls, photoBase64, ...rest } = result
        const payload = photoUrls.length > 0 ? { ...rest, photo_urls: photoUrls } : rest
        const content: unknown[] = [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
        for (const photo of photoBase64) {
          content.push({ type: 'image', data: photo.data, mimeType: photo.mimeType })
        }
        return mcpResult(id, { content })
      }

      if (name === 'list_food_photos_for_range') {
        const result = await handleListFoodPhotosForRange(args)
        if ('error' in result) {
          return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
        }
        const content: unknown[] = []
        if (result.pantry_brief) {
          content.push({ type: 'text', text: result.pantry_brief })
        }
        content.push({ type: 'text', text: result.summary })
        for (const n of result.notes) {
          content.push({ type: 'text', text: `Note for ${n.date}: ${n.text}` })
        }
        for (const p of result.photos) {
          content.push({ type: 'text', text: `Date: ${p.date}, uploaded ${p.time}` })
          content.push({ type: 'image', data: p.photo.data, mimeType: p.photo.mimeType })
        }
        return mcpResult(id, { content })
      }

      let data: unknown
      if (name === 'submit_proposed_plan') data = await handleSubmitProposedPlan(args)
      else if (name === 'submit_proposal_by_date') data = await handleSubmitProposalByDate(args)
      else if (name === 'get_garmin_recovery_freshness') data = await handleGetGarminRecoveryFreshness(args)
      else if (name === 'get_lift_history') data = await handleGetLiftHistory(args)
      else if (name === 'save_nutrition_estimate') data = await handleSaveNutritionEstimate(args)
      else if (name === 'get_nutrition_summary_for_range') data = await handleGetNutritionSummaryForRange(args)
      else return mcpError(id, -32601, `Unknown tool: ${name}`)
      return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
    } catch (err) {
      return mcpError(id, -32603, err instanceof Error ? err.message : 'Internal error')
    }
  }

  return mcpError(id, -32601, `Method not found: ${method}`)
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return mcpError(null, -32700, 'Parse error')
  }

  // Batch support
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((r) => dispatch(r as McpRequest)))
    const results = await Promise.all(responses.map((r) => r.json()))
    return Response.json(results, { headers: CORS_HEADERS })
  }

  return dispatch(body as McpRequest)
}

// CORS preflight
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// GET/SSE not supported — this server never pushes server-initiated messages.
// Returning 405 tells Claude.ai to use POST-only mode and stops continuous SSE polling.
export function GET() {
  return new Response(null, { status: 405, headers: CORS_HEADERS })
}
