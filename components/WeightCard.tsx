import type { RenphoMeasurementDay } from '@/lib/schema'

interface WeightCardProps {
  measurement: RenphoMeasurementDay | null | undefined
}

// Read-only — the nightly renpho-sync cron is the only thing that ever calls
// the Renpho API (it invalidates concurrent sessions, so this must not offer
// a manual "fetch" button the way GarminRecoveryCard does). Renders nothing
// when there's no weight for this day.
export default function WeightCard({ measurement }: WeightCardProps) {
  const weightKg = typeof measurement?.weight_kg === 'number' ? measurement.weight_kg : null
  if (weightKg == null) return null

  const bodyFatPct = typeof measurement?.body_fat_pct === 'number' ? measurement.body_fat_pct : null
  const muscleKg = typeof measurement?.muscle_kg === 'number' ? measurement.muscle_kg : null
  const bmi = typeof measurement?.bmi === 'number' ? measurement.bmi : null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
          Weight · Renpho
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Weight</div>
          <div className="text-sky-400 text-lg font-mono font-black leading-none">{weightKg}</div>
          <div className="text-zinc-600 text-[9px] font-mono mt-0.5">kg</div>
        </div>
        {bodyFatPct != null && (
          <div>
            <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Body Fat</div>
            <div className="text-amber-400 text-lg font-mono font-black leading-none">{bodyFatPct}%</div>
          </div>
        )}
        {muscleKg != null && (
          <div>
            <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Muscle</div>
            <div className="text-emerald-400 text-lg font-mono font-black leading-none">{muscleKg}</div>
            <div className="text-zinc-600 text-[9px] font-mono mt-0.5">kg</div>
          </div>
        )}
        {bmi != null && (
          <div>
            <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">BMI</div>
            <div className="text-violet-400 text-lg font-mono font-black leading-none">{bmi}</div>
          </div>
        )}
      </div>
    </div>
  )
}
