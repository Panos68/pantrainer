import { put, head, del, list } from '@vercel/blob'
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

const CURRENT_WEEK_KEY = 'data/current-week.json'
const ATHLETE_KEY = 'data/athlete.json'
const STATE_KEY = 'data/state.json'
const AUTOMATION_NOTES_KEY = 'data/automation-notes.json'
const PROPOSED_LATEST_KEY = 'data/proposed/latest.json'
const PROPOSED_HISTORY_PREFIX = 'data/proposed/history/'
const PENDING_WEEK_KEY = 'data/pending-week.json'
const WEEKS_PREFIX = 'data/weeks/'

async function readBlobAsJson<T>(pathname: string): Promise<T | null> {
  try {
    const blob = await head(pathname)
    const token = process.env.BLOB_READ_WRITE_TOKEN
    const res = await fetch(blob.url, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

function cachedBlobRead<T>(pathname: string, tag: string): () => Promise<T | null> {
  return unstable_cache(() => readBlobAsJson<T>(pathname), [pathname], {
    tags: [tag],
    revalidate: 3600,
  })
}

async function writeBlobAsJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

async function deleteBlobIfExists(pathname: string): Promise<void> {
  try {
    const blob = await head(pathname)
    await del(blob.url)
  } catch {
    // blob not found, ignore
  }
}

const _readCurrentWeekCached = cachedBlobRead<unknown>(CURRENT_WEEK_KEY, 'current-week')
export async function readCurrentWeek(): Promise<WeekDoc | null> {
  const raw = await _readCurrentWeekCached()
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writeCurrentWeek(week: WeekDoc): Promise<void> {
  await writeBlobAsJson(CURRENT_WEEK_KEY, week)
  revalidateTag('current-week', { expire: 0 })
}

const _readAthleteProfileCached = cachedBlobRead<unknown>(ATHLETE_KEY, 'athlete-profile')
export async function readAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await _readAthleteProfileCached()
  if (!raw) return null
  return AthleteProfileSchema.parse(raw)
}

export async function writeAthleteProfile(profile: AthleteProfile): Promise<void> {
  await writeBlobAsJson(ATHLETE_KEY, profile)
  revalidateTag('athlete-profile', { expire: 0 })
}

const _readAppStateCached = cachedBlobRead<unknown>(STATE_KEY, 'app-state')
export async function readAppState(): Promise<AppState> {
  const raw = await _readAppStateCached()
  if (!raw) {
    const defaults = AppStateSchema.parse({})
    await writeBlobAsJson(STATE_KEY, defaults)
    revalidateTag('app-state', { expire: 0 })
    return defaults
  }
  return AppStateSchema.parse(raw)
}

export async function writeAppState(state: AppState): Promise<void> {
  await writeBlobAsJson(STATE_KEY, state)
  revalidateTag('app-state', { expire: 0 })
}

function toProposalSnapshotKey(createdAt: string): string {
  const safeStamp = createdAt.replace(/[:.]/g, '-')
  return `${PROPOSED_HISTORY_PREFIX}${safeStamp}.json`
}

const _readAutomationNotesCached = cachedBlobRead<unknown>(AUTOMATION_NOTES_KEY, 'automation-notes')
export async function readAutomationNotes(): Promise<AutomationNotes> {
  const raw = await _readAutomationNotesCached()
  if (!raw) {
    const defaults = AutomationNotesSchema.parse({})
    await writeBlobAsJson(AUTOMATION_NOTES_KEY, defaults)
    revalidateTag('automation-notes', { expire: 0 })
    return defaults
  }
  return AutomationNotesSchema.parse(raw)
}

export async function writeAutomationNotes(notes: AutomationNotes): Promise<void> {
  await writeBlobAsJson(AUTOMATION_NOTES_KEY, notes)
  revalidateTag('automation-notes', { expire: 0 })
}

const _readProposedPlanCached = cachedBlobRead<unknown>(PROPOSED_LATEST_KEY, 'proposed-plan')
export async function readProposedPlan(): Promise<ProposedPlan | null> {
  const raw = await _readProposedPlanCached()
  if (!raw) return null
  return ProposedPlanSchema.parse(raw)
}

export async function writeProposedPlan(plan: ProposedPlan): Promise<void> {
  await Promise.all([
    writeBlobAsJson(PROPOSED_LATEST_KEY, plan),
    writeBlobAsJson(toProposalSnapshotKey(plan.created_at), plan),
  ])
  revalidateTag('proposed-plan', { expire: 0 })
}

export async function clearProposedPlan(): Promise<void> {
  await deleteBlobIfExists(PROPOSED_LATEST_KEY)
  revalidateTag('proposed-plan', { expire: 0 })
}

const _readPendingWeekCached = cachedBlobRead<unknown>(PENDING_WEEK_KEY, 'pending-week')
export async function readPendingWeek(): Promise<WeekDoc | null> {
  const raw = await _readPendingWeekCached()
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writePendingWeek(week: WeekDoc): Promise<void> {
  await writeBlobAsJson(PENDING_WEEK_KEY, week)
  revalidateTag('pending-week', { expire: 0 })
}

export async function clearPendingWeek(): Promise<void> {
  await deleteBlobIfExists(PENDING_WEEK_KEY)
  revalidateTag('pending-week', { expire: 0 })
}

function getWeekFilename(week: WeekDoc): string {
  if (week.sessions && week.sessions.length > 0) {
    const firstDate = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date
    return `week-${format(parseISO(firstDate), 'yyyy-ww')}.json`
  }
  return `week-${format(new Date(), 'yyyy-ww')}.json`
}

export async function archiveWeek(week: WeekDoc): Promise<void> {
  const filename = getWeekFilename(week)
  await writeBlobAsJson(`${WEEKS_PREFIX}${filename}`, week)
  await deleteBlobIfExists(CURRENT_WEEK_KEY)
  revalidateTag('archived-weeks', { expire: 0 })
  revalidateTag('current-week', { expire: 0 })
}

async function fetchBlobUrl(url: string): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  return fetch(url, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

const _listArchivedWeekBlobs = unstable_cache(
  async () => {
    const result = await list({ prefix: WEEKS_PREFIX })
    return result.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname))
  },
  ['archived-week-blobs'],
  { tags: ['archived-weeks'], revalidate: 86400 }
)

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const sorted = await _listArchivedWeekBlobs()
  const slice = sorted.slice(-n)
  const weeks = await Promise.all(
    slice.map(async (blob) => {
      const res = await fetchBlobUrl(blob.url)
      return WeekDocSchema.parse(await res.json())
    })
  )
  return weeks
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const sorted = await _listArchivedWeekBlobs()
  return Promise.all(
    sorted.map(async (blob) => {
      const res = await fetchBlobUrl(blob.url)
      return WeekDocSchema.parse(await res.json())
    })
  )
}

export async function readDailyReadiness(date: string): Promise<DailyReadiness | null> {
  const week = await readCurrentWeek()
  if (!week) return null
  return week.daily_readiness?.[date] ?? null
}

export async function writeDailyReadiness(readiness: DailyReadiness): Promise<void> {
  const week = await readCurrentWeek()
  if (!week) throw new Error('No active week')
  week.daily_readiness = { ...week.daily_readiness, [readiness.date]: readiness }
  await writeCurrentWeek(week)
}
