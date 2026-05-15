export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { format, differenceInDays, parseISO, subDays } from 'date-fns'
import Link from 'next/link'
import { readAthleteProfile, readCurrentWeek, readAppState, readArchivedWeeks, readPendingWeek } from '@/lib/data'
import { isPendingWeekDue } from '@/lib/week-activation'
import { sessionToLoadPoint } from '@/lib/training-load'
import GymWeekBadge from '@/components/GymWeekBadge'
import NewWeekButton from '@/components/NewWeekButton'
import HealthFlagsBanner from '@/components/HealthFlagsBanner'
import WeekBrowser from '@/components/WeekBrowser'
import HomeQuickPanels from '@/components/HomeQuickPanels'
import RecoveryScorePanel from '@/components/RecoveryScorePanel'
import AdaptiveAlertBanner from '@/components/AdaptiveAlertBanner'

function formatDuration(totalMin: number): string {
  if (totalMin <= 0) return '—'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function WeekStatsBar({
  calories, durationMin, load, loadDelta, loadZone,
}: {
  calories: number
  durationMin: number
  load: number
  loadDelta: number | null
  loadZone: { label: string; color: string } | null
}) {
  return (
    <div className="flex gap-6 sm:gap-10">
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Calories</p>
        <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">
          {calories > 0 ? calories.toLocaleString() : '—'}
        </p>
      </div>
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Time</p>
        <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">{formatDuration(durationMin)}</p>
      </div>
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Load</p>
        <div className="flex items-baseline gap-2">
          <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">
            {load > 0 ? load.toString() : '—'}
          </p>
          {loadZone && (
            <span className={`text-[11px] font-mono font-bold uppercase ${loadZone.color}`}>{loadZone.label}</span>
          )}
          {loadDelta != null && (
            <span className={`text-[11px] font-mono font-bold ${loadDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {loadDelta > 0 ? `+${loadDelta}%` : `${loadDelta}%`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function Home() {
  if (await isPendingWeekDue()) redirect('/api/week/activate')

  const profile = await readAthleteProfile()
  if (!profile) redirect('/setup')

  const [week, appState, archivedWeeks, pendingWeek] = await Promise.all([
    readCurrentWeek(),
    readAppState(),
    readArchivedWeeks(12),
    readPendingWeek(),
  ])
  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const athlete = { rhr: profile.rhr_bpm, maxHr: 220 - profile.age }

  if (!week) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">
            PanTrainer
          </p>
          <h1 className="text-5xl font-black tracking-tight uppercase leading-none">
            No Active<br />Week
          </h1>
          <p className="text-zinc-500 text-sm">
            No training week is loaded. Start a new week to begin tracking.
          </p>
          <div>
            <NewWeekButton
              label="START YOUR WEEK"
              className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
            />
          </div>
        </div>
      </main>
    )
  }

  const completedSessions = week.sessions.filter((s) => s.status === 'completed')
  const weekCalories = week.week_summary.total_calories
  const weekDurationMin = completedSessions.reduce((sum, s) => sum + (s.duration_min ?? 0), 0)
  const weekLoad = Math.round(
    completedSessions
      .map((s) => sessionToLoadPoint(s, athlete))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .reduce((sum, p) => sum + p.training_load, 0)
  )

  const prevWeek = archivedWeeks.length > 0 ? archivedWeeks[archivedWeeks.length - 1] : null
  // Compare same day-of-week: only count last week's sessions up to the equivalent day.
  // Remap JS getDay() (0=Sun…6=Sat) to Mon-anchored (Mon=0…Sun=6).
  const remapDay = (d: number) => (d + 6) % 7
  const todayRemapped = remapDay(new Date(todayISO).getDay())
  const prevWeekLoad = prevWeek
    ? Math.round(
        prevWeek.sessions
          .filter((s) => s.status === 'completed' && remapDay(new Date(s.date).getDay()) <= todayRemapped)
          .map((s) => sessionToLoadPoint(s, athlete))
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .reduce((sum, p) => sum + p.training_load, 0)
      )
    : null

  const loadDelta = prevWeekLoad != null && prevWeekLoad > 0 && weekLoad > 0
    ? Math.round(((weekLoad - prevWeekLoad) / prevWeekLoad) * 100)
    : null

  // ACWR zone using all history up to today
  const allLoadPoints = [...archivedWeeks, week]
    .flatMap((w) => w.sessions)
    .filter((s) => s.status === 'completed' && s.date <= todayISO)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const acwr = (() => {
    if (allLoadPoints.length < 3) return null
    const oldest = allLoadPoints[0].date
    const latest = allLoadPoints[allLoadPoints.length - 1].date
    if (differenceInDays(parseISO(latest), parseISO(oldest)) < 21) return null
    const acuteStart = format(subDays(parseISO(latest), 6), 'yyyy-MM-dd')
    const chronicStart = format(subDays(parseISO(latest), 27), 'yyyy-MM-dd')
    const acute = allLoadPoints.filter((p) => p.date >= acuteStart).reduce((s, p) => s + p.training_load, 0)
    const chronicPts = allLoadPoints.filter((p) => p.date >= chronicStart && p.date <= latest)
    const chronic = chronicPts.length > 0 ? chronicPts.reduce((s, p) => s + p.training_load, 0) / 4 : null
    if (!chronic || chronic === 0) return null
    return Math.round((acute / chronic) * 100) / 100
  })()

  const loadZone: { label: string; color: string } | null = acwr == null ? null
    : acwr >= 0.8 && acwr <= 1.0 ? { label: 'Optimal', color: 'text-emerald-400' }
    : acwr > 1.0 && acwr <= 1.3 ? { label: 'Moderate', color: 'text-amber-400' }
    : acwr > 1.3 ? { label: 'High Risk', color: 'text-red-400' }
    : { label: 'Low', color: 'text-zinc-400' }

  const hasActiveFlags = week.health_flags.some((f) => !f.cleared)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase leading-none text-zinc-50">
              {profile.name}
            </h1>
          </div>
          <div className="flex flex-col sm:items-end gap-1.5">
            <span className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
              {week.week}
            </span>
            <GymWeekBadge gymWeek={appState.gymWeek} />
          </div>
        </header>

        <div>
          <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2">This Week</p>
          <WeekStatsBar calories={weekCalories} durationMin={weekDurationMin} load={weekLoad} loadDelta={loadDelta} loadZone={loadZone} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 items-start">
          <HomeQuickPanels week={week} todayISO={todayISO} baselineRhr={profile.rhr_bpm} />
          <RecoveryScorePanel />
        </div>

        <AdaptiveAlertBanner />

        <div className="space-y-3">
          {hasActiveFlags && <HealthFlagsBanner flags={week.health_flags} />}
        </div>

        <WeekBrowser weeks={[...archivedWeeks, week]} pendingWeek={pendingWeek ?? undefined} todayISO={todayISO} />

        <footer className="hidden md:flex items-center gap-4 pt-4 border-t border-zinc-800">
          <Link
            href="/export"
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Plan Next Week
          </Link>
          <Link
            href="/progress"
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Progress
          </Link>
        </footer>

      </div>
    </main>
  )
}
