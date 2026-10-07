import type { LiftRecords } from './strength'

// Strength ratios between the main lifts, compared against commonly cited
// reference ranges for balanced development (Poliquin-style structural
// balance, simplified to the lifts this app tracks). Uses best estimated 1RMs.

export interface RatioDefinition {
  id: string
  label: string
  numerator: { label: string; keys: string[] }
  denominator: { label: string; keys: string[] }
  range: [number, number]
  lowHint: string
  highHint: string
}

const SQUAT = ['squat_kg', 'back_squat_kg', 'barbell_back_squat_kg', 'barbell_squat_kg']
const DEADLIFT = ['deadlift_kg']
const BENCH = ['bench_press_kg']
const OVERHEAD = ['push_press_kg', 'military_press_kg', 'strict_press_kg']
const ROW = ['pendlay_row_kg', 'barbell_row_kg', 'bent_over_row_kg', 'barbell_bent_over_row_kg', 'barbell_pendlay_row_kg']

export const RATIOS: RatioDefinition[] = [
  {
    id: 'bench-deadlift', label: 'Bench : Deadlift',
    numerator: { label: 'Bench', keys: BENCH }, denominator: { label: 'Deadlift', keys: DEADLIFT },
    range: [0.6, 0.75],
    lowHint: 'Upper-body pressing is lagging your pull — prioritise bench volume.',
    highHint: 'Your pull is lagging your press — give the deadlift and posterior chain more work.',
  },
  {
    id: 'squat-deadlift', label: 'Squat : Deadlift',
    numerator: { label: 'Squat', keys: SQUAT }, denominator: { label: 'Deadlift', keys: DEADLIFT },
    range: [0.8, 0.9],
    lowHint: 'Quads are lagging — more squat volume or front squats.',
    highHint: 'Hinge strength is lagging — more deadlift/RDL work.',
  },
  {
    id: 'overhead-bench', label: 'Overhead : Bench',
    numerator: { label: 'Overhead / push press', keys: OVERHEAD }, denominator: { label: 'Bench', keys: BENCH },
    range: [0.6, 0.8],
    lowHint: 'Shoulders are lagging the bench — add overhead pressing.',
    highHint: 'Bench is lagging the overhead press — add horizontal pressing.',
  },
  {
    id: 'row-bench', label: 'Row : Bench',
    numerator: { label: 'Barbell row', keys: ROW }, denominator: { label: 'Bench', keys: BENCH },
    range: [0.8, 1.05],
    lowHint: 'Upper-back pulling is lagging the press — a common shoulder-health risk. Add rows.',
    highHint: 'Plenty of pulling relative to pressing — no action needed unless the bench stalls.',
  },
]

export type BalanceStatus = 'low' | 'ok' | 'high'

export interface BalanceResult {
  id: string
  label: string
  ratio: number
  range: [number, number]
  status: BalanceStatus
  numeratorKg: number
  denominatorKg: number
  hint: string | null
}

function bestE1rm(records: Map<string, LiftRecords>, keys: string[]): number | null {
  let best: number | null = null
  for (const key of keys) {
    const v = records.get(key)?.bestE1rm
    if (v != null && (best == null || v > best)) best = v
  }
  return best
}

export function structuralBalance(records: Map<string, LiftRecords>): BalanceResult[] {
  const out: BalanceResult[] = []
  for (const def of RATIOS) {
    const num = bestE1rm(records, def.numerator.keys)
    const den = bestE1rm(records, def.denominator.keys)
    if (num == null || den == null || den <= 0) continue
    const ratio = Math.round((num / den) * 100) / 100
    const status: BalanceStatus = ratio < def.range[0] ? 'low' : ratio > def.range[1] ? 'high' : 'ok'
    out.push({
      id: def.id, label: def.label, ratio, range: def.range, status,
      numeratorKg: num, denominatorKg: den,
      hint: status === 'low' ? def.lowHint : status === 'high' ? def.highHint : null,
    })
  }
  return out
}
