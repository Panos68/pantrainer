import { detectPrs, PR_LABEL, type LiftRecords } from '@/lib/strength'
import { plateBreakdown, usesBarbell, type PlateInventory } from '@/lib/plates'
import type { ProgressionSuggestion } from '@/lib/progression-engine'

// Context shown under the reps/weight inputs on the live set screen: the
// progression engine's target (with its reason), a live "this would be a PR"
// preview, and the plates to load for barbell lifts.
export default function LiveStrengthHints({
  exerciseName,
  reps,
  weight,
  records,
  suggestion,
  plates,
}: {
  exerciseName: string
  reps: string
  weight: string
  records: LiftRecords | undefined
  suggestion: ProgressionSuggestion | undefined
  plates: PlateInventory
}) {
  const repsNum = Number(reps)
  const weightNum = Number(weight)
  const prs = weightNum > 0 && repsNum > 0 ? detectPrs({ weight: weightNum, reps: repsNum }, records) : []
  const load = usesBarbell(exerciseName) && weightNum > 0 ? plateBreakdown(weightNum, plates) : null

  return (
    <div className="w-full max-w-xs space-y-2 text-center">
      {prs.length > 0 && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-mono">
          🏆 This set would be a PR — {prs.map((k) => PR_LABEL[k]).join(' · ')}
        </div>
      )}
      {load && (
        <div className="text-[11px] font-mono text-zinc-400">
          {load.perSide.length === 0
            ? `Empty bar (${plates.barKg} kg)`
            : `Per side: ${load.perSide.join(' + ')} kg`}
          {!load.exact && <span className="text-amber-400"> · closest you can load is {load.loadedKg} kg</span>}
        </div>
      )}
      {suggestion && (
        <div className="text-[11px] text-zinc-500 leading-relaxed">
          <span className="font-mono text-zinc-300">Target {suggestion.targetWeight} kg × {suggestion.targetReps}</span>
          <span className="block">{suggestion.reason}</span>
        </div>
      )}
    </div>
  )
}
