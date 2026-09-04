// Vercel Functions run wherever the project's Function Region is set (this
// project runs in us-east-1/iad1), not near the athlete — never derive "today"
// from server-local Date getters. Always resolve it against this explicit zone.
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Stockholm'

export function todayIsoInAppTimeZone(): string {
  return isoDateInAppTimeZone(new Date())
}

export function isoDateInAppTimeZone(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatTimeInAppTimeZone(date: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date))
}
