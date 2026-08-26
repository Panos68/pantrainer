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
} from '@/lib/data'
import { buildExportV2 } from '@/lib/export'
import { validateImport } from '@/lib/import'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'
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
      'Fetch food photos and any written food notes for an inclusive date range so they can be analyzed for approximate calorie/macro content. Returns each photo as an inline image labeled with the date it was uploaded for, plus any freeform notes the athlete typed directly in the app describing what they ate (an alternative to photographing everything). Use this when the athlete asks about their eating/calories for a period — there is no separate calorie database yet, so photos and notes are the only sources; if neither is found for the range, say so rather than guessing.',
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
      'Save a calorie/macro estimate for a specific day, whether derived from analyzing food photos (list_food_photos_for_range) or from a plain-text description the athlete gave in chat (e.g. "had kvarg and granola for breakfast"). Before estimating from text, check recent entries via get_nutrition_summary_for_range for a similar description and anchor to that prior estimate so repeat meals stay consistent rather than drifting each time. Re-saving a date overwrites the previous estimate for that date.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD) this estimate is for. Required.' },
        calories: { type: 'number', description: 'Estimated total calories for the day. Required.' },
        protein: { type: 'number', description: 'Estimated grams of protein.' },
        carbs: { type: 'number', description: 'Estimated grams of carbs.' },
        fat: { type: 'number', description: 'Estimated grams of fat.' },
        description: { type: 'string', description: 'Brief description of what was eaten. Required.' },
      },
      required: ['date', 'calories', 'description'],
    },
  },
  {
    name: 'get_nutrition_summary_for_range',
    description:
      'Get a cheap summary of saved nutrition estimates for a date range (e.g. "this week", "last 10 days") without re-analyzing any photos. Returns each day\'s saved calories/macros/description, a total and average, and gap_dates — dates in the range that have uploaded food photos but no saved estimate yet. For any gap_dates, call list_food_photos_for_range for just those dates to fill them in, rather than reprocessing the whole range.',
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
      return { pathname: b.pathname, date }
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

  const [matches, notes] = await Promise.all([
    matchFoodPhotoBlobsForRange(startDate, endDate, token),
    readFoodNotesForRange(startDate, endDate),
  ])

  const noteSummaries = notes.map((n) => ({ date: n._id, text: n.text }))

  if (matches.length === 0) {
    return {
      summary:
        noteSummaries.length > 0
          ? `No food photos found between ${startDate} and ${endDate}, but ${noteSummaries.length} written note(s) exist.`
          : `No food photos or notes found between ${startDate} and ${endDate}.`,
      photos: [],
      notes: noteSummaries,
    }
  }

  const photos = await Promise.all(
    matches.map(async (m) => ({ date: m.date, photo: await fetchPhotoAsBase64(m.pathname) })),
  )

  return {
    summary: `Found ${matches.length} food photo(s) and ${noteSummaries.length} written note(s) between ${startDate} and ${endDate}.`,
    photos: photos.filter((p): p is { date: string; photo: { data: string; mimeType: string } } => p.photo !== null),
    notes: noteSummaries,
  }
}

async function handleSaveNutritionEstimate(args: Record<string, unknown>) {
  const date = args.date
  const calories = args.calories
  const description = args.description
  if (typeof date !== 'string' || typeof calories !== 'number' || typeof description !== 'string') {
    return { error: 'date (string), calories (number), and description (string) are required' }
  }

  const macros: NutritionLogEntry['macros'] = {}
  if (typeof args.protein === 'number') macros.protein = args.protein
  if (typeof args.carbs === 'number') macros.carbs = args.carbs
  if (typeof args.fat === 'number') macros.fat = args.fat

  const entry: NutritionLogEntry = {
    _id: date,
    estimatedCalories: calories,
    macros: Object.keys(macros).length > 0 ? macros : undefined,
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
  const loggedDates = new Set(entries.map((e) => e._id))

  let gapDates: string[] = []
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    const photoMatches = await matchFoodPhotoBlobsForRange(startDate, endDate, token)
    const photoDates = new Set(photoMatches.map((m) => m.date))
    gapDates = [...photoDates].filter((d) => !loggedDates.has(d)).sort()
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
      description: e.description,
    })),
    total_calories: totalCalories,
    avg_calories: avgCalories,
    gap_dates: gapDates,
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
        const content: unknown[] = [{ type: 'text', text: result.summary }]
        for (const n of result.notes) {
          content.push({ type: 'text', text: `Note for ${n.date}: ${n.text}` })
        }
        for (const p of result.photos) {
          content.push({ type: 'text', text: `Date: ${p.date}` })
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
