'use client'

import { useState } from 'react'
import { detectPrs, PR_LABEL, type LiftRecords } from '@/lib/strength'
import { BAR_OPTIONS, inventoryWithBar, nextBarWeight, plateBreakdown, usesBarbell } from '@/lib/plates'
import { nameToKey } from '@/lib/progression'
import type { ProgressionSuggestion } from '@/lib/progression-engine'

// Bar weight per exercise, remembered on this device (gyms differ, the same
// lift at the same gym usually doesn't).
const barKey = (exerciseName: string) => `bar-kg:${nameToKey(exerciseName)}`

function readBar(exerciseName: string): number {
  try {
    const stored = Number(localStorage.getItem(barKey(exerciseName)))
    return (BAR_OPTIONS as readonly number[]).includes(stored) ? stored : BAR_OPTIONS[0]
  } catch {
    return BAR_OPTIONS[0]
  }
}

// Context shown under the reps/weight inputs on the live set screen: the
// progression engine's target (with its reason), a live "this would be a PR"
// preview, and the plates to load for barbell lifts.
export default function LiveStrengthHints({
  exerciseName,
  reps,
  weight,
  records,
  suggestion,
}: {
  exerciseName: string
  reps: string
  weight: string
  records: LiftRecords | undefined
  suggestion: ProgressionSuggestion | undefined
}) {
  // Rendered only on the client (the live page shows a loader until the
  // session loads), so reading localStorage in the initialiser is safe.
  const [barKg, setBarKg] = useState(() => readBar(exerciseName))

  function cycleBar() {
    const next = nextBarWeight(barKg)
    setBarKg(next)
    try {
      localStorage.setItem(barKey(exerciseName), String(next))
    } catch {
      // storage blocked — keep it for this screen only
    }
  }

  const repsNum = Number(reps)
  const weightNum = Number(weight)
  const prs = weightNum > 0 && repsNum > 0 ? detectPrs({ weight: weightNum, reps: repsNum }, records) : []
  const barbell = usesBarbell(exerciseName)
  const load = barbell && weightNum > 0 ? plateBreakdown(weightNum, inventoryWithBar(barKg)) : null

  return (
    <div className="w-full max-w-xs space-y-2 text-center">
      {prs.length > 0 && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-mono">
          🏆 This set would be a PR — {prs.map((k) => PR_LABEL[k]).join(' · ')}
        </div>
      )}
      {barbell && (
        <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-400">
          <button
            type="button"
            onClick={cycleBar}
            title="Tap to change the bar"
            className="px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            {barKg} kg bar
          </button>
          {load && (
            <span>
              {load.perSide.length === 0 ? 'empty bar' : `per side: ${load.perSide.join(' + ')} kg`}
              {!load.exact && <span className="text-amber-400"> · nearest {load.loadedKg} kg</span>}
            </span>
          )}
          {weightNum > 0 && weightNum < barKg && <span className="text-amber-400">lighter than the bar</span>}
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
