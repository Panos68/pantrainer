export const dynamic = 'force-dynamic'

import { readAllArchivedWeeks, readCurrentWeek, readAthleteProfile } from '@/lib/data'
import LiftProgressChart from '@/components/LiftProgressChart'
import ActivityTrendChart from '@/components/ActivityTrendChart'
import PmcChart from '@/components/PmcChart'
import { calcPmc } from '@/lib/pmc'
import { sessionToLoadPoint } from '@/lib/training-load'
import type { WeekDoc } from '@/lib/schema'

export default async function ProgressPage() {
  const [archived, current, profile] = await Promise.all([readAllArchivedWeeks(), readCurrentWeek(), readAthleteProfile()])
  const weeks: WeekDoc[] = current ? [...archived, current] : archived

  const athlete = profile
    ? { rhr: profile.rhr_bpm, maxHr: 220 - profile.age }
    : undefined

  const loadPoints = weeks
    .flatMap((w) => w.sessions)
    .filter((s) => s.status === 'completed')
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const pmcData = calcPmc(loadPoints)

  const totalSessions = weeks.reduce((sum, w) => sum + w.sessions.filter((s) => s.status === 'completed').length, 0)
  const totalCalories = weeks.reduce((sum, w) => sum + w.week_summary.total_calories, 0)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase leading-none text-zinc-50">
              Progress
            </h1>
          </div>
          <a
            href="/"
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors self-start sm:self-auto"
          >
            ← Back
          </a>
        </header>

        {/* Stats summary */}
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-zinc-50">{weeks.length}</p>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-1">Weeks Tracked</p>
          </div>
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-zinc-50">{totalSessions}</p>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-1">Total Sessions</p>
          </div>
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-zinc-50">
              {totalCalories >= 1000
                ? `${(totalCalories / 1000).toFixed(1)}k`
                : totalCalories}
            </p>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-1">Total Calories</p>
          </div>
        </section>

        {/* Performance Management Chart */}
        <PmcChart data={pmcData} />

        {/* Lift Progress Chart */}
        <LiftProgressChart weeks={weeks} />

        {/* Activity Trend Chart */}
        <ActivityTrendChart weeks={weeks} />

      </div>
    </main>
  )
}
