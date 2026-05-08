import { unstable_cache, revalidateTag } from 'next/cache'
import {
  WeekDocSchema,
  AthleteProfileSchema,
  AppStateSchema,
  AutomationNotesSchema,
  ProposedPlanSchema,
} from './schema'
import type { WeekDoc, AthleteProfile, AppState, AutomationNotes, ProposedPlan, DailyReadiness } from './schema'
import { format, parseISO } from 'date-fns'
import { getDb } from './mongodb'

async function dbGet<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const doc = await db.collection('data').findOne({ _id: key as never })
  if (!doc) return null
  return doc.value as T
}

async function dbSet(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.collection('data').replaceOne(
    { _id: key as never },
    { _id: key as never, value, updatedAt: new Date() },
    { upsert: true }
  )
}

async function dbDel(key: string): Promise<void> {
  const db = await getDb()
  await db.collection('data').deleteOne({ _id: key as never })
}

const CURRENT_WEEK_KEY = 'current-week'
const ATHLETE_KEY = 'athlete'
const STATE_KEY = 'state'
const AUTOMATION_NOTES_KEY = 'automation-notes'
const PROPOSED_LATEST_KEY = 'proposed-latest'
const PROPOSED_HISTORY_PREFIX = 'proposed-history/'
const WEEKS_PREFIX = 'week/'

function cachedRead<T>(key: string, tag: string): () => Promise<T | null> {
  return unstable_cache(() => dbGet<T>(key), [key], {
    tags: [tag],
    revalidate: 3600,
  })
}

const _readCurrentWeekCached = cachedRead<unknown>(CURRENT_WEEK_KEY, 'current-week')
export async function readCurrentWeek(): Promise<WeekDoc | null> {
  const raw = await _readCurrentWeekCached()
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function readCurrentWeekDirect(): Promise<WeekDoc | null> {
  const raw = await dbGet<unknown>(CURRENT_WEEK_KEY)
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writeCurrentWeek(week: WeekDoc): Promise<void> {
  await dbSet(CURRENT_WEEK_KEY, week)
  revalidateTag('current-week', { expire: 0 })
}

const _readAthleteProfileCached = cachedRead<unknown>(ATHLETE_KEY, 'athlete-profile')
export async function readAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await _readAthleteProfileCached()
  if (!raw) return null
  return AthleteProfileSchema.parse(raw)
}

export async function writeAthleteProfile(profile: AthleteProfile): Promise<void> {
  await dbSet(ATHLETE_KEY, profile)
  revalidateTag('athlete-profile', { expire: 0 })
}

const _readAppStateCached = cachedRead<unknown>(STATE_KEY, 'app-state')
export async function readAppState(): Promise<AppState> {
  const raw = await _readAppStateCached()
  if (!raw) {
    const defaults = AppStateSchema.parse({})
    await dbSet(STATE_KEY, defaults)
    revalidateTag('app-state', { expire: 0 })
    return defaults
  }
  return AppStateSchema.parse(raw)
}

export async function writeAppState(state: AppState): Promise<void> {
  await dbSet(STATE_KEY, state)
  revalidateTag('app-state', { expire: 0 })
}

const _readAutomationNotesCached = cachedRead<unknown>(AUTOMATION_NOTES_KEY, 'automation-notes')
export async function readAutomationNotes(): Promise<AutomationNotes> {
  const raw = await _readAutomationNotesCached()
  if (!raw) {
    const defaults = AutomationNotesSchema.parse({})
    await dbSet(AUTOMATION_NOTES_KEY, defaults)
    revalidateTag('automation-notes', { expire: 0 })
    return defaults
  }
  return AutomationNotesSchema.parse(raw)
}

export async function writeAutomationNotes(notes: AutomationNotes): Promise<void> {
  await dbSet(AUTOMATION_NOTES_KEY, notes)
  revalidateTag('automation-notes', { expire: 0 })
}

const _readProposedPlanCached = cachedRead<unknown>(PROPOSED_LATEST_KEY, 'proposed-plan')
export async function readProposedPlan(): Promise<ProposedPlan | null> {
  const raw = await _readProposedPlanCached()
  if (!raw) return null
  return ProposedPlanSchema.parse(raw)
}

export async function writeProposedPlan(plan: ProposedPlan): Promise<void> {
  const snapshotKey = `${PROPOSED_HISTORY_PREFIX}${plan.created_at.replace(/[:.]/g, '-')}`
  await Promise.all([
    dbSet(PROPOSED_LATEST_KEY, plan),
    dbSet(snapshotKey, plan),
  ])
  revalidateTag('proposed-plan', { expire: 0 })
}

export async function clearProposedPlan(): Promise<void> {
  await dbDel(PROPOSED_LATEST_KEY)
  revalidateTag('proposed-plan', { expire: 0 })
}

const _readPendingWeekCached = cachedRead<unknown>('pending-week', 'pending-week')
export async function readPendingWeek(): Promise<WeekDoc | null> {
  const raw = await _readPendingWeekCached()
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writePendingWeek(week: WeekDoc): Promise<void> {
  await dbSet('pending-week', week)
  revalidateTag('pending-week', { expire: 0 })
}

export async function clearPendingWeek(): Promise<void> {
  await dbDel('pending-week')
  revalidateTag('pending-week', { expire: 0 })
}

function getWeekFilename(week: WeekDoc): string {
  if (week.sessions && week.sessions.length > 0) {
    const firstDate = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date
    return `week-${format(parseISO(firstDate), 'yyyy-ww')}`
  }
  return `week-${format(new Date(), 'yyyy-ww')}`
}

export async function archiveWeek(week: WeekDoc): Promise<void> {
  const key = `${WEEKS_PREFIX}${getWeekFilename(week)}`
  await dbSet(key, week)
  await dbDel(CURRENT_WEEK_KEY)
  revalidateTag('archived-weeks', { expire: 0 })
  revalidateTag('current-week', { expire: 0 })
}

const _listArchivedWeekKeys = unstable_cache(
  async () => {
    const db = await getDb()
    const docs = await db
      .collection('data')
      .find({ _id: { $regex: `^${WEEKS_PREFIX}` } as never })
      .sort({ _id: 1 })
      .toArray()
    return docs.map((d) => d._id as unknown as string)
  },
  ['archived-week-keys'],
  { tags: ['archived-weeks'], revalidate: 86400 }
)

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const keys = await _listArchivedWeekKeys()
  const slice = keys.slice(-n)
  const db = await getDb()
  const docs = await db
    .collection('data')
    .find({ _id: { $in: slice } as never })
    .sort({ _id: 1 })
    .toArray()
  return docs.map((d) => WeekDocSchema.parse(d.value))
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const db = await getDb()
  const docs = await db
    .collection('data')
    .find({ _id: { $regex: `^${WEEKS_PREFIX}` } as never })
    .sort({ _id: 1 })
    .toArray()
  return docs.map((d) => WeekDocSchema.parse(d.value))
}

export async function readDailyReadiness(date: string): Promise<DailyReadiness | null> {
  const week = await readCurrentWeek()
  if (!week) return null
  return week.daily_readiness?.[date] ?? null
}

export async function writeDailyReadiness(readiness: DailyReadiness): Promise<void> {
  const week = await readCurrentWeekDirect()
  if (!week) throw new Error('No active week')
  week.daily_readiness = { ...week.daily_readiness, [readiness.date]: readiness }
  await writeCurrentWeek(week)
}
