import type { HeatmapDay } from '@/lib/activity-heatmap'

const LEVEL_CLASS: Record<HeatmapDay['level'], string> = {
  0: 'bg-zinc-800/60',
  1: 'bg-lime-900',
  2: 'bg-lime-700',
  3: 'bg-lime-500',
  4: 'bg-lime-300',
}

function title(d: HeatmapDay): string {
  if (d.sessions === 0) return `${d.date}: rest`
  const mins = d.minutes > 0 ? ` · ${d.minutes} min` : ''
  return `${d.date}: ${d.types.join(' + ')}${mins}`
}

export default function ActivityHeatmap({
  columns,
  stats,
}: {
  columns: HeatmapDay[][]
  stats: { activeDays: number; longestWeekStreak: number; currentWeekStreak: number }
}) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">Consistency</h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-xl font-black">{stats.activeDays}</p><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Training days</p></div>
        <div><p className="text-xl font-black">{stats.currentWeekStreak}</p><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Week streak</p></div>
        <div><p className="text-xl font-black">{stats.longestWeekStreak}</p><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Longest streak</p></div>
      </div>
      {/* Scrolls horizontally on phones; newest weeks are on the right. */}
      <div className="overflow-x-auto" dir="rtl">
        <div className="inline-flex gap-[3px]" dir="ltr">
          {columns.map((col) => (
            <div key={col[0].date} className="flex flex-col gap-[3px]">
              {col.map((d) => (
                <div
                  key={d.date}
                  title={title(d)}
                  className={`w-3 h-3 rounded-[3px] ${d.inFuture ? 'bg-transparent' : LEVEL_CLASS[d.level]}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono text-zinc-500">
        less
        {([0, 1, 2, 3, 4] as const).map((l) => <span key={l} className={`w-3 h-3 rounded-[3px] ${LEVEL_CLASS[l]}`} />)}
        more
      </div>
    </div>
  )
}
