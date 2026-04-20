import { put, head, del, list } from '@vercel/blob'
import { WeekDocSchema, AthleteProfileSchema, AppStateSchema } from './schema'
import type { WeekDoc, AthleteProfile, AppState } from './schema'
import { format, parseISO } from 'date-fns'

const CURRENT_WEEK_KEY = 'data/current-week.json'
const ATHLETE_KEY = 'data/athlete.json'
const STATE_KEY = 'data/state.json'
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

async function writeBlobAsJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'private',
    addRandomSuffix: false,
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

export async function readCurrentWeek(): Promise<WeekDoc | null> {
  const raw = await readBlobAsJson<unknown>(CURRENT_WEEK_KEY)
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writeCurrentWeek(week: WeekDoc): Promise<void> {
  await writeBlobAsJson(CURRENT_WEEK_KEY, week)
}

export async function readAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await readBlobAsJson<unknown>(ATHLETE_KEY)
  if (!raw) return null
  return AthleteProfileSchema.parse(raw)
}

export async function writeAthleteProfile(profile: AthleteProfile): Promise<void> {
  await writeBlobAsJson(ATHLETE_KEY, profile)
}

export async function readAppState(): Promise<AppState> {
  const raw = await readBlobAsJson<unknown>(STATE_KEY)
  if (!raw) {
    const defaults = AppStateSchema.parse({})
    await writeBlobAsJson(STATE_KEY, defaults)
    return defaults
  }
  return AppStateSchema.parse(raw)
}

export async function writeAppState(state: AppState): Promise<void> {
  await writeBlobAsJson(STATE_KEY, state)
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
}

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const result = await list({ prefix: WEEKS_PREFIX })
  const sorted = result.blobs
    .sort((a, b) => b.pathname.localeCompare(a.pathname))
    .slice(0, n)
  const weeks = await Promise.all(
    sorted.map(async (blob) => {
      const res = await fetch(blob.url, { cache: 'no-store' })
      return WeekDocSchema.parse(await res.json())
    })
  )
  return weeks.reverse()
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const result = await list({ prefix: WEEKS_PREFIX })
  const sorted = result.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname))
  return Promise.all(
    sorted.map(async (blob) => {
      const res = await fetch(blob.url, { cache: 'no-store' })
      return WeekDocSchema.parse(await res.json())
    })
  )
}
