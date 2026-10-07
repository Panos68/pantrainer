import type { LiftRecords, TrackedLift } from '@/lib/strength'

export default function PersonalRecords({ lifts, records }: { lifts: TrackedLift[]; records: Record<string, LiftRecords> }) {
  if (lifts.length === 0) return null
  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">Personal Records</h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              <th className="text-left font-normal py-1.5">Lift</th>
              <th className="text-right font-normal py-1.5">Heaviest</th>
              <th className="text-right font-normal py-1.5">Best e1RM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {lifts.map((l) => {
              const r = records[l.key]
              return (
                <tr key={l.key}>
                  <td className="py-2 pr-3 text-zinc-200">{l.name}</td>
                  <td className="py-2 text-right font-mono text-zinc-300">{r?.bestWeight ?? '—'} kg</td>
                  <td className="py-2 text-right font-mono text-lime-400">{r?.bestE1rm ?? '—'} kg</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
