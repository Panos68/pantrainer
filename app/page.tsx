import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { readAthleteProfile, readCurrentWeek, readAppState } from '@/lib/data'
import GymWeekBadge from '@/components/GymWeekBadge'
import DeloadBanner from '@/components/DeloadBanner'
import HealthFlagsBanner from '@/components/HealthFlagsBanner'
import WeekGrid from '@/components/WeekGrid'
import NotionSync from '@/components/NotionSync'

export default function Home() {
  const profile = readAthleteProfile()
  if (!profile) redirect('/setup')

  const week = readCurrentWeek()
  const appState = readAppState()
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  // No week yet — show start state
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
          <form
            action="/api/week/new"
            method="POST"
          >
            <button
              type="submit"
              className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors"
            >
              START YOUR WEEK
            </button>
          </form>
        </div>
      </main>
    )
  }

  const hasActiveFlags = week.health_flags.some((f) => !f.cleared)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Header ── */}
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

        {/* ── Banners ── */}
        <div className="space-y-3">
          <DeloadBanner counter={appState.deloadCounter} />
          {hasActiveFlags && (
            <HealthFlagsBanner flags={week.health_flags} />
          )}
        </div>

        {/* ── Week Grid ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
              This Week
            </h2>
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs font-mono">
              {week.sessions.filter((s) => s.status === 'completed').length}
              /{week.sessions.length} DONE
            </span>
          </div>
          <WeekGrid sessions={week.sessions} todayISO={todayISO} />
        </section>

        {/* ── Footer actions ── */}
        <footer className="flex flex-col gap-3 pt-4 border-t border-zinc-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <a
              href="/exports"
              className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Export Week
            </a>
            <form action="/api/week/new" method="POST">
              <button
                type="submit"
                className="px-6 h-9 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-zinc-50 font-bold text-xs tracking-[0.15em] uppercase rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all"
              >
                Start New Week
              </button>
            </form>
          </div>
          <NotionSync
            lastSync={appState.notionLastSync ?? null}
            notionConfigured={!!process.env.NOTION_TOKEN}
          />
        </footer>

      </div>
    </main>
  )
}
