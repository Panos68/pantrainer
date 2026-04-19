import fs from 'fs'
import path from 'path'
import { WeekDocSchema, AthleteProfileSchema, AppStateSchema } from './schema'
import type { WeekDoc, AthleteProfile, AppState } from './schema'
import { format, parseISO } from 'date-fns'

const DATA_DIR = path.join(process.cwd(), 'data')
const WEEKS_DIR = path.join(DATA_DIR, 'weeks')
const CURRENT_WEEK_PATH = path.join(DATA_DIR, 'current-week.json')
const ATHLETE_PATH = path.join(DATA_DIR, 'athlete.json')
const STATE_PATH = path.join(DATA_DIR, 'state.json')

// Ensure directories exist
function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(WEEKS_DIR, { recursive: true })
}

export function readCurrentWeek(): WeekDoc | null {
  ensureDirs()
  if (!fs.existsSync(CURRENT_WEEK_PATH)) return null
  const raw = fs.readFileSync(CURRENT_WEEK_PATH, 'utf-8')
  return WeekDocSchema.parse(JSON.parse(raw))
}

export function writeCurrentWeek(week: WeekDoc): void {
  ensureDirs()
  fs.writeFileSync(CURRENT_WEEK_PATH, JSON.stringify(week, null, 2))
}

export function readAthleteProfile(): AthleteProfile | null {
  ensureDirs()
  if (!fs.existsSync(ATHLETE_PATH)) return null
  const raw = fs.readFileSync(ATHLETE_PATH, 'utf-8')
  return AthleteProfileSchema.parse(JSON.parse(raw))
}

export function writeAthleteProfile(profile: AthleteProfile): void {
  ensureDirs()
  fs.writeFileSync(ATHLETE_PATH, JSON.stringify(profile, null, 2))
}

export function readAppState(): AppState {
  ensureDirs()
  if (!fs.existsSync(STATE_PATH)) {
    const defaults = AppStateSchema.parse({})
    fs.writeFileSync(STATE_PATH, JSON.stringify(defaults, null, 2))
    return defaults
  }
  const raw = fs.readFileSync(STATE_PATH, 'utf-8')
  return AppStateSchema.parse(JSON.parse(raw))
}

export function writeAppState(state: AppState): void {
  ensureDirs()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function getWeekFilename(week: WeekDoc): string {
  // Try first session date
  if (week.sessions && week.sessions.length > 0) {
    const firstDate = week.sessions.sort((a, b) => a.date.localeCompare(b.date))[0].date
    return `week-${format(parseISO(firstDate), 'yyyy-ww')}.json`
  }
  // Fall back to current date
  return `week-${format(new Date(), 'yyyy-ww')}.json`
}

export function archiveWeek(week: WeekDoc): void {
  ensureDirs()
  // Generate filename from week's session dates
  const filename = getWeekFilename(week)
  const archivePath = path.join(WEEKS_DIR, filename)
  fs.writeFileSync(archivePath, JSON.stringify(week, null, 2))
  // Remove current week file
  if (fs.existsSync(CURRENT_WEEK_PATH)) {
    fs.unlinkSync(CURRENT_WEEK_PATH)
  }
}

export function readArchivedWeeks(n: number): WeekDoc[] {
  ensureDirs()
  if (!fs.existsSync(WEEKS_DIR)) return []
  const files = fs.readdirSync(WEEKS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, n)
  return files.map(f => {
    const raw = fs.readFileSync(path.join(WEEKS_DIR, f), 'utf-8')
    return WeekDocSchema.parse(JSON.parse(raw))
  })
}

export function readAllArchivedWeeks(): WeekDoc[] {
  ensureDirs()
  if (!fs.existsSync(WEEKS_DIR)) return []
  const files = fs.readdirSync(WEEKS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
  return files.map(f => {
    const raw = fs.readFileSync(path.join(WEEKS_DIR, f), 'utf-8')
    return WeekDocSchema.parse(JSON.parse(raw))
  })
}
