import Link from 'next/link'
import type { WeekDoc } from '@/lib/schema'

interface HomeQuickPanelsProps {
  week: WeekDoc
  todayISO: string
  baselineRhr: number
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export default function HomeQuickPanels({ week, todayISO, baselineRhr }: HomeQuickPanelsProps) {
  const sessions = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))
  const todayIndex = sessions.findIndex((s) => s.date === todayISO)
  const todaySession = todayIndex >= 0 ? sessions[todayIndex] : null

  const recoveryRows = sessions.slice(-7).map((s) => ({
    day: s.day.slice(0, 3).toUpperCase(),
    date: s.date,
    sleep: positiveOrNull(week.garmin_recovery?.[s.date]?.sleep_hours),
    rhr: positiveOrNull(week.garmin_recovery?.[s.date]?.resting_hr_bpm),
  }))

  const avgSleep = average(recoveryRows.map((r) => r.sleep).filter((v): v is number => v != null))
  const avgRhr = average(recoveryRows.map((r) => r.rhr).filter((v): v is number => v != null))
  const rhrDelta = avgRhr != null ? Math.round((avgRhr - baselineRhr) * 10) / 10 : null

  const readinessState =
    (avgSleep != null && avgSleep < 6.5) || (rhrDelta != null && rhrDelta > 5)
      ? { label: 'Reduce Load', color: 'text-amber-400' }
      : (avgSleep != null && avgSleep < 7) || (rhrDelta != null && rhrDelta > 3)
      ? { label: 'Watch Recovery', color: 'text-yellow-400' }
      : { label: 'Ready', color: 'text-lime-400' }

  const actionHref = todaySession ? `/log/${todaySession.day.toLowerCase()}` : '/'
  const actionLabel = !todaySession
    ? 'Open Week'
    : todaySession.status === 'completed' || todaySession.status === 'skipped'
    ? 'Review Today'
    : todaySession.status === 'in_progress'
    ? 'Continue Session'
    : 'Start Session'

  const todayRecovery = todaySession ? week.garmin_recovery?.[todaySession.date] : null
  const todaySleep = positiveOrNull(todayRecovery?.sleep_hours)
  const todayRhr = positiveOrNull(todayRecovery?.resting_hr_bpm)

  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div className="rounded-xl border border-lime-400/30 bg-gradient-to-br from-zinc-900 via-zinc-900 to-lime-400/5 p-4 space-y-3 shadow-[0_0_24px_rgba(163,230,53,0.08)]">
        <p className="text-lime-400/80 text-[10px] font-mono tracking-[0.2em] uppercase">Today Action</p>
        <div>
          <p className="text-zinc-100 text-sm font-mono font-bold uppercase">
            {todaySession ? `${todaySession.day} · ${todaySession.type}` : 'No session for today'}
          </p>
          {todaySession?.subtype && (
            <p className="text-zinc-300 text-xs font-mono mt-1 line-clamp-2">{todaySession.subtype}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {todaySleep != null && <span>Sleep {todaySleep}h</span>}
          {todaySleep != null && todayRhr != null && <span className="text-zinc-600">·</span>}
          {todayRhr != null && <span>RHR {todayRhr} bpm</span>}
          {todaySleep == null && todayRhr == null && <span className="text-zinc-400">No recovery data yet</span>}
          <span className="inline-flex h-6 items-center rounded-md border border-lime-400/30 bg-lime-400/10 px-2 text-[10px] tracking-widest uppercase text-lime-300">
            {todaySession?.status?.replace('_', ' ') ?? 'planned'}
          </span>
        </div>
        <Link
          href={actionHref}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-lime-400 hover:bg-lime-300 text-zinc-950 px-4 text-xs font-black tracking-[0.15em] uppercase transition-colors"
        >
          {actionLabel}
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Readiness Strip</p>
          <span className={`text-xs font-mono font-bold uppercase ${readinessState.color}`}>{readinessState.label}</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {recoveryRows.map((row) => (
            <div key={row.date} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-1.5 text-center">
              <p className="text-[9px] font-mono text-zinc-600">{row.day}</p>
              <p className="text-[10px] font-mono text-sky-400">{row.sleep != null ? `${row.sleep}h` : '—'}</p>
              <p className="text-[10px] font-mono text-rose-400">{row.rhr != null ? row.rhr : '—'}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-mono text-zinc-500">
          AVG sleep {avgSleep != null ? `${avgSleep}h` : '—'} · AVG RHR {avgRhr != null ? `${avgRhr} bpm` : '—'}
        </p>
      </div>

    </section>
  )
}
