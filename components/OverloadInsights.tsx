import type { ExerciseInsight } from '@/lib/overload'

const SIGNAL_STYLES = {
  pr:       { badge: 'bg-lime-400/20 text-lime-300 border-lime-400/30',    label: 'PR' },
  plateau:  { badge: 'bg-red-400/20 text-red-300 border-red-400/30',       label: 'Plateau' },
  progress: { badge: 'bg-amber-400/20 text-amber-300 border-amber-400/30', label: 'Progress' },
  ok:       { badge: 'bg-zinc-800 text-zinc-500 border-zinc-700',           label: 'OK' },
}

export default function OverloadInsights({ insights }: { insights: ExerciseInsight[] }) {
  const actionable = insights.filter((i) => i.signal !== 'ok')
  const ok = insights.filter((i) => i.signal === 'ok')

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-zinc-500 text-xs font-mono">No lift data yet — log some sessions with weights to see progression insights.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Strength Progression</p>

      {actionable.length > 0 && (
        <div className="space-y-2">
          {actionable.map((insight) => {
            const style = SIGNAL_STYLES[insight.signal]
            return (
              <div key={insight.exercise} className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase flex-shrink-0 ${style.badge}`}>
                  {style.label}
                </span>
                <div className="min-w-0">
                  <p className="text-zinc-200 text-sm font-semibold">
                    {insight.exercise}{' '}
                    <span className="text-zinc-500 font-normal text-xs">{insight.currentWeight}kg</span>
                  </p>
                  <p className="text-zinc-400 text-xs mt-0.5">{insight.suggestion}</p>
                  {insight.weeklyVelocityPct !== null && insight.weeklyVelocityPct !== 0 && (
                    <p className="text-zinc-600 text-[10px] font-mono mt-0.5">
                      {insight.weeklyVelocityPct > 0 ? '+' : ''}{insight.weeklyVelocityPct}%/week
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ok.length > 0 && (
        <details>
          <summary className="cursor-pointer text-zinc-600 text-[10px] font-mono uppercase tracking-widest select-none hover:text-zinc-400 transition-colors">
            {ok.length} progressing normally ▾
          </summary>
          <div className="mt-2 space-y-1">
            {ok.map((insight) => (
              <p key={insight.exercise} className="text-zinc-600 text-xs font-mono">
                {insight.exercise} — {insight.currentWeight}kg
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
