'use client'

import { useMemo, useState } from 'react'
import type { WeekDoc } from '@/lib/schema'
import WeekGrid from './WeekGrid'

interface WeekBrowserProps {
  weeks: WeekDoc[]
  todayISO: string
}

export default function WeekBrowser({ weeks, todayISO }: WeekBrowserProps) {
  const [index, setIndex] = useState(Math.max(weeks.length - 1, 0))
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
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
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
          onClick={() => setIndex((i) => Math.min(i + 1, weeks.length - 1))}
          disabled={index === weeks.length - 1}
          className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors text-xs font-mono tracking-widest uppercase"
        >
          Next →
        </button>
      </div>

      <WeekGrid
        sessions={selected.sessions}
        todayISO={isCurrent ? todayISO : ''}
        garminRecovery={selected.garmin_recovery ?? {}}
        readOnly={!isCurrent}
      />
    </section>
  )
}
