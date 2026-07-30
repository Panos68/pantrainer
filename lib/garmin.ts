import { createRequire } from 'module'
import { getDb } from './mongodb'

const require = createRequire(import.meta.url)
// garmin-connect is CJS — cast to any to avoid type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GarminConnect } = require('garmin-connect') as any

const TOKEN_KEY = 'garmin-tokens'

async function loadCachedToken(): Promise<{ oauth1: unknown; oauth2: unknown } | null> {
  try {
    const db = await getDb()
    const doc = await db.collection('data').findOne({ _id: TOKEN_KEY as never })
    if (!doc) return null
    return doc.value as { oauth1: unknown; oauth2: unknown }
  } catch {
    return null
  }
}

async function saveCachedToken(token: unknown): Promise<void> {
  const db = await getDb()
  await db.collection('data').replaceOne(
    { _id: TOKEN_KEY as never },
    { _id: TOKEN_KEY as never, value: token, updatedAt: new Date() },
    { upsert: true }
  )
}

async function createClient() {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('GARMIN_EMAIL and GARMIN_PASSWORD must be set')

  const client = new GarminConnect({ username: email, password })

  const cached = await loadCachedToken()
  if (cached) {
    try {
      await client.loadToken(cached.oauth1, cached.oauth2)
      return client
    } catch {
      // Token invalid — fall through to fresh login
    }
  }

  await client.login()
  await saveCachedToken(client.exportToken())
  return client
}

export type GarminActivityRaw = {
  activityId: number
  activityName: string
  activityType: { typeKey: string }
  startTimeLocal: string   // "2026-04-20 09:00:00"
  duration: number         // seconds
  averageHR: number | null
  calories: number | null
  distance: number | null   // meters
  averageSpeed: number | null   // m/s
  // Training load & effect — present in activities list when available
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
  trainingStressScore: number | null
  // HR zones — present in detailed activity response
  hrZones?: HRZone[] | null
}

export type HRZone = {
  zone_name: string
  secs_in_zone: number
  zone_high_boundary: number
}

export type GarminSleepResult = {
  sleep_hours: number
  deep_sleep_hours: number
  rem_sleep_hours: number
}

export type GarminHRResult = {
  resting_hr_bpm: number | null
  max_hr_bpm: number | null
}

export async function fetchActivitiesForDate(date: string): Promise<{ activities: GarminActivityRaw[]; client: unknown }> {
  const client = await createClient()
  const all: GarminActivityRaw[] = await client.getActivities(0, 20)
  return { activities: all.filter((a) => a.startTimeLocal?.startsWith(date)), client }
}

export async function fetchActivityDetail(activityId: number, existingClient?: unknown): Promise<{ hrZones: HRZone[] | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = existingClient ?? await createClient()
  try {
    const detail = await client.getActivity({ activityId }) as {
      heartRateZones?: Array<{ zoneName: string; secsInZone: number; zoneHighBoundary: number }>
    }
    const zones = detail?.heartRateZones
    if (!zones?.length) return { hrZones: null }
    return {
      hrZones: zones.map((z) => ({
        zone_name: z.zoneName,
        secs_in_zone: z.secsInZone,
        zone_high_boundary: z.zoneHighBoundary,
      })),
    }
  } catch {
    return { hrZones: null }
  }
}

export async function fetchSleepData(date: string): Promise<GarminSleepResult | null> {
  const client = await createClient()
  const dateObj = new Date(date + 'T12:00:00')
  const raw = await client.getSleepData(dateObj)
  const dto = raw?.dailySleepDTO
  if (!dto || !dto.sleepTimeSeconds) return null
  return {
    sleep_hours: Math.round((dto.sleepTimeSeconds / 3600) * 10) / 10,
    deep_sleep_hours: Math.round((dto.deepSleepSeconds / 3600) * 10) / 10,
    rem_sleep_hours: Math.round((dto.remSleepSeconds / 3600) * 10) / 10,
  }
}

export async function fetchHRData(date: string): Promise<GarminHRResult> {
  const client = await createClient()
  const dateObj = new Date(date + 'T12:00:00')
  const raw = await client.getHeartRate(dateObj)
  return {
    resting_hr_bpm: raw?.restingHeartRate ?? null,
    max_hr_bpm: raw?.maxHeartRate ?? null,
  }
}

export type GarminBodyBatteryResult = {
  body_battery_charged: number | null
  body_battery_drained: number | null
}

export async function fetchBodyBattery(date: string): Promise<GarminBodyBatteryResult | null> {
  try {
    const client = await createClient()
    const base = client.url.GC_API
    const raw = await client.client.get<Array<{ charged?: number; drained?: number }>>(
      `${base}/wellness-service/wellness/bodyBattery/reports/daily?startDate=${date}&endDate=${date}`
    )
    const entry = Array.isArray(raw) ? raw[0] : null
    if (!entry) return null
    return {
      body_battery_charged: typeof entry.charged === 'number' && entry.charged > 0 ? entry.charged : null,
      body_battery_drained: typeof entry.drained === 'number' && entry.drained > 0 ? entry.drained : null,
    }
  } catch {
    return null
  }
}

export type GarminStressResult = {
  avg_stress_level: number | null
  max_stress_level: number | null
}

export async function fetchStress(date: string): Promise<GarminStressResult | null> {
  try {
    const client = await createClient()
    const base = client.url.GC_API
    const raw = await client.client.get<{ avgStressLevel?: number; maxStressLevel?: number }>(
      `${base}/wellness-service/wellness/dailyStress/${date}`
    )
    if (!raw) return null
    return {
      avg_stress_level: typeof raw.avgStressLevel === 'number' && raw.avgStressLevel >= 0 ? raw.avgStressLevel : null,
      max_stress_level: typeof raw.maxStressLevel === 'number' && raw.maxStressLevel >= 0 ? raw.maxStressLevel : null,
    }
  } catch {
    return null
  }
}

export type GarminVo2MaxResult = {
  vo2max: number | null
}

function subtractDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export async function fetchVO2Max(date: string): Promise<GarminVo2MaxResult | null> {
  try {
    const client = await createClient()
    const base = client.url.GC_API
    const startDate = subtractDays(date, 90)
    const raw = await client.client.get<Array<{ calendarDate?: string; generic?: { vo2MaxValue?: number | null } }>>(
      `${base}/metrics-service/metrics/maxmet/daily/${startDate}/${date}`
    )
    if (!Array.isArray(raw) || raw.length === 0) return null
    const withValue = raw.filter((entry) => typeof entry.generic?.vo2MaxValue === 'number')
    if (withValue.length === 0) return null
    const latest = withValue[withValue.length - 1]
    return { vo2max: latest.generic?.vo2MaxValue ?? null }
  } catch {
    return null
  }
}

export type GarminFitnessAgeResult = {
  fitness_age: number | null
  achievable_fitness_age: number | null
}

export async function fetchFitnessAge(date: string): Promise<GarminFitnessAgeResult | null> {
  try {
    const client = await createClient()
    const base = client.url.GC_API
    const raw = await client.client.get<{ fitnessAge?: number | null; achievableFitnessAge?: number | null }>(
      `${base}/fitnessage-service/fitnessage/${date}`
    )
    if (!raw) return null
    return {
      fitness_age: typeof raw.fitnessAge === 'number' ? raw.fitnessAge : null,
      achievable_fitness_age: typeof raw.achievableFitnessAge === 'number' ? raw.achievableFitnessAge : null,
    }
  } catch {
    return null
  }
}
