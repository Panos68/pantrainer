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

const _listArchivedWeekIds = unstable_cache(
  async () => {
    const db = await getDb()
    const docs = await db
      .collection('weeks')
      .find({ _id: { $regex: '^archive-' } as never })
      .sort({ _id: 1 })
      .project({ _id: 1 })
      .toArray()
    return docs.map((d) => d._id as unknown as string)
  },
  ['archived-week-ids'],
  { tags: ['archived-weeks'], revalidate: 86400 }
)

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const ids = await _listArchivedWeekIds()
  const slice = ids.slice(-n)
  const db = await getDb()
  const docs = await db
    .collection('weeks')
    .find({ _id: { $in: slice } as never })
    .sort({ _id: 1 })
    .toArray()
  return docs.map((d) => WeekDocSchema.parse(d.value))
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const db = await getDb()
  const docs = await db
    .collection('weeks')
    .find({ _id: { $regex: '^archive-' } as never })
    .sort({ _id: 1 })
    .toArray()
  return docs.map((d) => WeekDocSchema.parse(d.value))
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
