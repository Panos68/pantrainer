import { unstable_cache, revalidateTag } from 'next/cache'
import {
  WeekDocSchema,
  AthleteProfileSchema,
  AppStateSchema,
  AutomationNotesSchema,
  ProposedPlanSchema,
  GarminExerciseMapEntrySchema,
  NutritionLogEntrySchema,
} from './schema'
import type {
  WeekDoc,
  AthleteProfile,
  AppState,
  AutomationNotes,
  ProposedPlan,
  DailyReadiness,
  GarminExerciseMapEntry,
  NutritionLogEntry,
} from './schema'
import { format, parseISO } from 'date-fns'
import { getDb } from './mongodb'

// Collections:
//   config    — singleton docs: athlete, state, automation-notes, garmin-tokens
//   weeks     — current, pending, archive-<yyyy-ww>
//   proposals — single "latest" doc, overwritten on each new proposal

async function configGet<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const doc = await db.collection('config').findOne({ _id: key as never })
  return doc ? (doc.value as T) : null
}

async function configSet(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.collection('config').replaceOne(
    { _id: key as never },
    { _id: key as never, value, updatedAt: new Date() },
    { upsert: true }
  )
}

async function weekGet<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const doc = await db.collection('weeks').findOne({ _id: key as never })
  return doc ? (doc.value as T) : null
}

async function weekSet(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.collection('weeks').replaceOne(
    { _id: key as never },
    { _id: key as never, value, updatedAt: new Date() },
    { upsert: true }
  )
}

async function weekDel(key: string): Promise<void> {
  const db = await getDb()
  await db.collection('weeks').deleteOne({ _id: key as never })
}

// ─── Current week ─────────────────────────────────────────────────────────────

const _readCurrentWeekCached = unstable_cache(
  () => weekGet<unknown>('current'),
  ['current-week'],
  { tags: ['current-week'], revalidate: 3600 }
)

export async function readCurrentWeek(): Promise<WeekDoc | null> {
  const raw = await _readCurrentWeekCached()
  return raw ? WeekDocSchema.parse(raw) : null
}

export async function readCurrentWeekDirect(): Promise<WeekDoc | null> {
  const raw = await weekGet<unknown>('current')
  return raw ? WeekDocSchema.parse(raw) : null
}

export async function writeCurrentWeek(week: WeekDoc): Promise<void> {
  await weekSet('current', week)
  revalidateTag('current-week', { expire: 0 })
}

// ─── Athlete profile ──────────────────────────────────────────────────────────

const _readAthleteProfileCached = unstable_cache(
  () => configGet<unknown>('athlete'),
  ['athlete-profile'],
  { tags: ['athlete-profile'], revalidate: 3600 }
)

export async function readAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await _readAthleteProfileCached()
  return raw ? AthleteProfileSchema.parse(raw) : null
}

export async function writeAthleteProfile(profile: AthleteProfile): Promise<void> {
  await configSet('athlete', profile)
  revalidateTag('athlete-profile', { expire: 0 })
}

// ─── App state ────────────────────────────────────────────────────────────────

const _readAppStateCached = unstable_cache(
  () => configGet<unknown>('state'),
  ['app-state'],
  { tags: ['app-state'], revalidate: 3600 }
)

export async function readAppState(): Promise<AppState> {
  const raw = await _readAppStateCached()
  if (!raw) {
    const defaults = AppStateSchema.parse({})
    await configSet('state', defaults)
    return defaults
  }
  return AppStateSchema.parse(raw)
}

export async function writeAppState(state: AppState): Promise<void> {
  await configSet('state', state)
  revalidateTag('app-state', { expire: 0 })
}

// ─── Automation notes ─────────────────────────────────────────────────────────

const _readAutomationNotesCached = unstable_cache(
  () => configGet<unknown>('automation-notes'),
  ['automation-notes'],
  { tags: ['automation-notes'], revalidate: 3600 }
)

export async function readAutomationNotes(): Promise<AutomationNotes> {
  const raw = await _readAutomationNotesCached()
  if (!raw) {
    const defaults = AutomationNotesSchema.parse({})
    await configSet('automation-notes', defaults)
    return defaults
  }
  return AutomationNotesSchema.parse(raw)
}

export async function writeAutomationNotes(notes: AutomationNotes): Promise<void> {
  await configSet('automation-notes', notes)
  revalidateTag('automation-notes', { expire: 0 })
}

// ─── Proposed plan ────────────────────────────────────────────────────────────

const _readProposedPlanCached = unstable_cache(
  async () => {
    const db = await getDb()
    const doc = await db.collection('proposals').findOne({ _id: 'latest' as never })
    return doc ? doc.value : null
  },
  ['proposed-plan'],
  { tags: ['proposed-plan'], revalidate: 3600 }
)

export async function readProposedPlan(): Promise<ProposedPlan | null> {
  const raw = await _readProposedPlanCached()
  return raw ? ProposedPlanSchema.parse(raw) : null
}

export async function writeProposedPlan(plan: ProposedPlan): Promise<void> {
  const db = await getDb()
  await db.collection('proposals').replaceOne(
    { _id: 'latest' as never },
    { _id: 'latest' as never, value: plan, updatedAt: new Date() },
    { upsert: true }
  )
  revalidateTag('proposed-plan', { expire: 0 })
}

export async function clearProposedPlan(): Promise<void> {
  const db = await getDb()
  await db.collection('proposals').deleteOne({ _id: 'latest' as never })
  revalidateTag('proposed-plan', { expire: 0 })
}

// ─── Pending week ─────────────────────────────────────────────────────────────

const _readPendingWeekCached = unstable_cache(
  () => weekGet<unknown>('pending'),
  ['pending-week'],
  { tags: ['pending-week'], revalidate: 3600 }
)

export async function readPendingWeek(): Promise<WeekDoc | null> {
  const raw = await _readPendingWeekCached()
  return raw ? WeekDocSchema.parse(raw) : null
}

export async function writePendingWeek(week: WeekDoc): Promise<void> {
  await weekSet('pending', week)
  revalidateTag('pending-week', { expire: 0 })
}

export async function clearPendingWeek(): Promise<void> {
  await weekDel('pending')
  revalidateTag('pending-week', { expire: 0 })
}

// ─── Archived weeks ───────────────────────────────────────────────────────────

function getWeekId(week: WeekDoc): string {
  if (week.sessions && week.sessions.length > 0) {
    const firstDate = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date
    return `archive-${format(parseISO(firstDate), 'yyyy-ww')}`
  }
  return `archive-${format(new Date(), 'yyyy-ww')}`
}

export async function archiveWeek(week: WeekDoc): Promise<void> {
  await weekSet(getWeekId(week), week)
  await weekDel('current')
  revalidateTag('archived-weeks', { expire: 0 })
  revalidateTag('current-week', { expire: 0 })
}

// Archived week _ids aren't reliably sortable as strings — the DB has a mix
// of the current 'archive-<yyyy-ww>' scheme and legacy 'archive-week-<yyyy-ww>'
// docs from an earlier version, and '2' sorts before 'w' regardless of actual
// date. Sorting by each week's own earliest session date is correct
// regardless of what naming scheme (past or future) produced the _id.
const _listArchivedWeekIdsByDate = unstable_cache(
  async () => {
    const db = await getDb()
    const docs = await db
      .collection('weeks')
      .find({ _id: { $regex: '^archive-' } as never })
      .project({ _id: 1, 'value.sessions.date': 1 })
      .toArray()
    return docs
      .map((d) => {
        const dates = (d as { value?: { sessions?: { date: string }[] } }).value?.sessions?.map((s) => s.date) ?? []
        const earliestDate = dates.length > 0 ? [...dates].sort()[0] : (d._id as unknown as string)
        return { id: d._id as unknown as string, earliestDate }
      })
      .sort((a, b) => a.earliestDate.localeCompare(b.earliestDate))
      .map((d) => d.id)
  },
  ['archived-week-ids-by-date'],
  { tags: ['archived-weeks'], revalidate: 86400 }
)

async function readWeeksByIds(ids: string[]): Promise<WeekDoc[]> {
  const db = await getDb()
  const docs = await db
    .collection('weeks')
    .find({ _id: { $in: ids } as never })
    .toArray()
  const byId = new Map(docs.map((d) => [d._id as unknown as string, d]))
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is NonNullable<typeof d> => d != null)
    .map((d) => WeekDocSchema.parse(d.value))
}

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const ids = await _listArchivedWeekIdsByDate()
  return readWeeksByIds(ids.slice(-n))
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const ids = await _listArchivedWeekIdsByDate()
  return readWeeksByIds(ids)
}

// ─── Daily readiness ──────────────────────────────────────────────────────────

export async function readDailyReadiness(date: string): Promise<DailyReadiness | null> {
  const week = await readCurrentWeek()
  return week?.daily_readiness?.[date] ?? null
}

export async function writeDailyReadiness(readiness: DailyReadiness): Promise<void> {
  const week = await readCurrentWeekDirect()
  if (!week) throw new Error('No active week')
  week.daily_readiness = { ...week.daily_readiness, [readiness.date]: readiness }
  await writeCurrentWeek(week)
}

// ─── Garmin exercise mapping ───────────────────────────────────────────────────
// Small collection (~dozens of rows): app exercise name → Garmin structured-workout
// catalog entry (category/exerciseName). Read fully by the push route and by the
// list_garmin_exercise_mappings MCP tool; written by the bootstrap step and by
// the save_garmin_exercise_mapping MCP tool.

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase()
}

export async function readGarminExerciseMap(): Promise<Record<string, GarminExerciseMapEntry>> {
  const db = await getDb()
  const docs = await db.collection('exercise_garmin_map').find({}).toArray()
  const entries = docs.map((d) => GarminExerciseMapEntrySchema.parse(d))
  return Object.fromEntries(entries.map((e) => [e._id, e]))
}

export async function readGarminExerciseMapping(normalizedName: string): Promise<GarminExerciseMapEntry | null> {
  const db = await getDb()
  const doc = await db.collection('exercise_garmin_map').findOne({ _id: normalizedName as never })
  return doc ? GarminExerciseMapEntrySchema.parse(doc) : null
}

export async function writeGarminExerciseMapping(entry: GarminExerciseMapEntry): Promise<void> {
  const db = await getDb()
  await db.collection('exercise_garmin_map').replaceOne(
    { _id: entry._id as never },
    entry,
    { upsert: true }
  )
}

// ─── Nutrition log ──────────────────────────────────────────────────────────
// One doc per day, keyed by date. Written by the save_nutrition_estimate MCP
// tool after Claude analyzes a day's food photos or a text description; read
// by the day-log page and by the get_nutrition_summary_for_range MCP tool.

export async function readNutritionLogEntry(date: string): Promise<NutritionLogEntry | null> {
  const db = await getDb()
  const doc = await db.collection('nutrition_log').findOne({ _id: date as never })
  return doc ? NutritionLogEntrySchema.parse(doc) : null
}

export async function readNutritionLogForRange(startDate: string, endDate: string): Promise<NutritionLogEntry[]> {
  const db = await getDb()
  const docs = await db
    .collection('nutrition_log')
    .find({ _id: { $gte: startDate as never, $lte: endDate as never } })
    .sort({ _id: 1 })
    .toArray()
  return docs.map((d) => NutritionLogEntrySchema.parse(d))
}

export async function writeNutritionLogEntry(entry: NutritionLogEntry): Promise<void> {
  const db = await getDb()
  await db.collection('nutrition_log').replaceOne(
    { _id: entry._id as never },
    entry,
    { upsert: true }
  )
}
