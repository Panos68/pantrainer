import type { BalanceResult } from '@/lib/structural-balance'

const STATUS_STYLE: Record<BalanceResult['status'], string> = {
  ok: 'text-lime-400 border-lime-400/30 bg-lime-400/10',
  low: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  high: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
}

export default function StructuralBalanceCard({ balance }: { balance: BalanceResult[] }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">Structural Balance</h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>
      {balance.length === 0 ? (
        <p className="text-zinc-600 text-sm font-mono">Needs best e1RMs for at least two of bench, deadlift, squat, overhead press and barbell row.</p>
      ) : (
        <ul className="space-y-3">
          {balance.map((b) => (
            <li key={b.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-200">{b.label}</span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${STATUS_STYLE[b.status]}`}>
                  {b.ratio.toFixed(2)} · target {b.range[0]}–{b.range[1]}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">{b.numeratorKg} kg vs {b.denominatorKg} kg (best e1RM)</p>
              {b.hint && <p className="text-xs text-zinc-400">{b.hint}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-zinc-600 font-mono">Reference ranges are general guidelines, not rules — body proportions shift them.</p>
    </div>
  )
}
