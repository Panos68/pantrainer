'use client'

import { useMemo, useState } from 'react'
import type { WeekDoc } from '@/lib/schema'
import WeekGrid from './WeekGrid'

interface WeekBrowserProps {
  weeks: WeekDoc[]
  todayISO: string
}

export default function WeekBrowser({ weeks, todayISO }: WeekBrowserProps) {
  const defaultDayForWeek = (week: WeekDoc) =>
    week.sessions.find((s) => s.date === todayISO)?.day ?? week.sessions[0]?.day ?? 'Monday'

  const [index, setIndex] = useState(Math.max(weeks.length - 1, 0))
  const [activeDay, setActiveDay] = useState<string>(defaultDayForWeek(weeks[Math.max(weeks.length - 1, 0)]))
  const selected = weeks[index]
  const isCurrent = index === weeks.length - 1

  const completedCount = useMemo(
    () => selected.sessions.filter((s) => s.status === 'completed').length,
    [selected.sessions],
  )

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          {isCurrent ? 'This Week' : 'Archived Week'}
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-zinc-600 text-xs font-mono">
          {completedCount}/{selected.sessions.length} DONE
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <button
          type="button"
          onClick={() =>
            setIndex((i) => {
              const nextIndex = Math.max(i - 1, 0)
              setActiveDay(defaultDayForWeek(weeks[nextIndex]))
              return nextIndex
            })
          }
          disabled={index === 0}
          className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors text-xs font-mono tracking-widest uppercase"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-zinc-400 text-[10px] font-mono tracking-[0.2em] uppercase">
            {isCurrent ? 'Current Week' : 'Read-only Archive'}
          </p>
          <p className="text-zinc-200 text-xs font-mono">{selected.week}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setIndex((i) => {
              const nextIndex = Math.min(i + 1, weeks.length - 1)
              setActiveDay(defaultDayForWeek(weeks[nextIndex]))
              return nextIndex
            })
          }
          disabled={index === weeks.length - 1}
          className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors text-xs font-mono tracking-widest uppercase"
        >
          Next →
        </button>
      </div>

      <div className="md:hidden mb-3 -mx-1 px-1 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {selected.sessions.map((session) => {
            const active = activeDay === session.day
            return (
              <button
                key={session.date}
                type="button"
                onClick={() => setActiveDay(session.day)}
                className={`h-8 px-3 rounded-lg border text-[10px] font-mono font-bold tracking-widest uppercase transition-colors ${
                  active
                    ? 'border-lime-400/40 bg-lime-400/10 text-lime-400'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                }`}
              >
                {session.day.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="md:hidden">
        <WeekGrid
          sessions={selected.sessions.filter((s) => s.day === activeDay)}
          todayISO={isCurrent ? todayISO : ''}
          garminRecovery={selected.garmin_recovery ?? {}}
          readOnly={!isCurrent}
          collapsibleOnMobile={isCurrent}
        />
      </div>

      <div className="hidden md:block">
        <WeekGrid
          sessions={selected.sessions}
          todayISO={isCurrent ? todayISO : ''}
          garminRecovery={selected.garmin_recovery ?? {}}
          readOnly={!isCurrent}
        />
      </div>
    </section>
  )
}
