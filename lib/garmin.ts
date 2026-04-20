import pkg from 'garmin-connect'

// garmin-connect is CJS — cast to any to avoid type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GarminConnect } = pkg as any

export type GarminActivityRaw = {
  activityId: number
  activityName: string
  activityType: { typeKey: string }
  startTimeLocal: string   // "2026-04-20 09:00:00"
  duration: number         // seconds
  averageHR: number | null
  calories: number | null
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

async function createClient() {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('GARMIN_EMAIL and GARMIN_PASSWORD must be set')
  const client = new GarminConnect({ username: email, password })
  await client.login()
  return client
}

export async function fetchActivitiesForDate(date: string): Promise<GarminActivityRaw[]> {
  const client = await createClient()
  // Fetch last 20 activities and filter by date prefix on startTimeLocal
  const all: GarminActivityRaw[] = await client.getActivities(0, 20)
  return all.filter((a) => a.startTimeLocal?.startsWith(date))
}

export async function fetchSleepData(date: string): Promise<GarminSleepResult | null> {
  const client = await createClient()
  const dateObj = new Date(date + 'T12:00:00')
  const raw = await client.getSleepData(dateObj)
  const dto = raw?.dailySleepDTO
  if (!dto) return null
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
