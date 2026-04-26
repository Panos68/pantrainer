import { archiveWeek, clearPendingWeek, readCurrentWeek, readPendingWeek, writeCurrentWeek } from './data'
import { rollDeloadCounterOnWeekAdvance } from './state'
import type { WeekDoc } from './schema'

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Athens'

function todayIsoInTimeZone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseDateAtNoon(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function deriveMondayFromSessions(week: WeekDoc): Date | null {
  for (const session of week.sessions) {
    const dayIndex = ALL_DAYS.indexOf(session.day)
    const date = parseDateAtNoon(session.date)
    if (dayIndex >= 0 && date) {
      const monday = new Date(date)
      monday.setUTCDate(date.getUTCDate() - dayIndex)
      return monday
    }
  }
  return null
}

function weekStartIso(week: WeekDoc | null): string | null {
  if (!week) return null
  const monday = deriveMondayFromSessions(week)
  return monday ? monday.toISOString().slice(0, 10) : null
}

export async function activatePendingWeekIfDue(): Promise<{
  activated: boolean
  reason: string
  currentWeek: WeekDoc | null
}> {
  const pending = await readPendingWeek()
  if (!pending) {
    return { activated: false, reason: 'no_pending_week', currentWeek: await readCurrentWeek() }
  }

  const pendingStart = weekStartIso(pending)
  if (!pendingStart) {
    await clearPendingWeek()
    return { activated: false, reason: 'invalid_pending_week', currentWeek: await readCurrentWeek() }
  }

  const todayIso = todayIsoInTimeZone()
  if (pendingStart > todayIso) {
    return { activated: false, reason: 'pending_not_due', currentWeek: await readCurrentWeek() }
  }

  const current = await readCurrentWeek()
  if (weekStartIso(current) === pendingStart) {
    await clearPendingWeek()
    return { activated: false, reason: 'already_active', currentWeek: current }
  }

  if (current) {
    await archiveWeek(current)
    await rollDeloadCounterOnWeekAdvance()
  }
  await writeCurrentWeek(pending)
  await clearPendingWeek()
  return { activated: true, reason: 'activated', currentWeek: pending }
}
