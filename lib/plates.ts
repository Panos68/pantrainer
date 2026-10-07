// Plate math: which plates to load on each side of the bar for a target
// weight, using only the plates the athlete actually owns.

export interface PlateInventory {
  barKg: number
  // Plate sizes available, each assumed to come in pairs; `count` is pairs.
  plates: Array<{ kg: number; pairs: number }>
}

export const DEFAULT_PLATE_INVENTORY: PlateInventory = {
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((kg) => ({ kg, pairs: 4 })),
}

export interface PlateLoad {
  perSide: number[] // heaviest first
  loadedKg: number // what the bar actually weighs with these plates
  exact: boolean
}

const EPS = 1e-9

// Greedy from the heaviest plate is optimal for standard plate sets; the result
// never exceeds the target, so a non-exact answer is the nearest load below it.
export function plateBreakdown(targetKg: number, inventory: PlateInventory = DEFAULT_PLATE_INVENTORY): PlateLoad | null {
  if (!(targetKg > 0)) return null
  if (targetKg < inventory.barKg - EPS) return null
  let perSideRemaining = (targetKg - inventory.barKg) / 2
  const perSide: number[] = []
  const sizes = [...inventory.plates].filter((p) => p.kg > 0 && p.pairs > 0).sort((a, b) => b.kg - a.kg)
  for (const { kg, pairs } of sizes) {
    let used = 0
    while (used < pairs && perSideRemaining + EPS >= kg) {
      perSide.push(kg)
      perSideRemaining -= kg
      used++
    }
  }
  const loadedKg = Math.round((inventory.barKg + 2 * perSide.reduce((a, b) => a + b, 0)) * 100) / 100
  return { perSide, loadedKg, exact: Math.abs(loadedKg - targetKg) < 0.01 }
}

// Commercial gyms have every plate, but bars differ (Olympic 20 kg, women's
// 15 kg, technique/EZ 10 kg), so the bar is picked per exercise on the live
// screen and remembered on the device.
export const BAR_OPTIONS = [20, 15, 10] as const

export function nextBarWeight(current: number): number {
  const i = BAR_OPTIONS.indexOf(current as (typeof BAR_OPTIONS)[number])
  return BAR_OPTIONS[(i + 1) % BAR_OPTIONS.length]
}

export function inventoryWithBar(barKg: number, base: PlateInventory = DEFAULT_PLATE_INVENTORY): PlateInventory {
  return { ...base, barKg }
}

// Plate math only makes sense for lifts done with a barbell.
export function usesBarbell(exerciseName: string): boolean {
  const lower = exerciseName.toLowerCase()
  if (/\b(dumbbells?|dumbells?|db|kettlebells?|kb|cable|machine|band|smith)\b/.test(lower)) return false
  return /\b(barbell|bench press|deadlift|squat|push press|overhead press|ohp|military press|pendlay|bent[- ]over row|hip thrust|clean|snatch|jerk|rdl|romanian)\b/.test(lower)
}
