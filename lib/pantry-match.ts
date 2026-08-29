import type { PantryItem } from './schema'

export interface Portion {
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find every pantry item mentioned in a piece of text, in the order they
 * appear. A note routinely names several foods ("kvarg and granola"), so this
 * returns all of them rather than a single best guess.
 *
 * Aliases match on word boundaries, so "jam" does not fire inside "pyjamas".
 * Where two aliases cover the same span the longer one wins, which is what
 * makes "granola kakao" beat the bare "granola" without suppressing a genuinely
 * separate food elsewhere in the sentence.
 */
export function matchPantryItems(text: string, pantry: PantryItem[]): PantryItem[] {
  const haystack = text.toLowerCase()

  const hits: Array<{ item: PantryItem; start: number; end: number }> = []
  for (const item of pantry) {
    for (const alias of item.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g')
      let m: RegExpExecArray | null
      while ((m = pattern.exec(haystack)) !== null) {
        hits.push({ item, start: m.index, end: m.index + alias.length })
      }
    }
  }

  // Longest span first at any given position, so an overlapping shorter alias
  // is dropped rather than winning on document order.
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))

  const chosen: PantryItem[] = []
  const seen = new Set<string>()
  let consumedTo = -1
  for (const hit of hits) {
    if (hit.start < consumedTo) continue // overlapped by a longer alias
    consumedTo = hit.end
    if (seen.has(hit.item._id)) continue
    seen.add(hit.item._id)
    chosen.push(hit.item)
  }

  return chosen
}

/**
 * Scale a pantry item to a weight. `grams === null` means the amount could not
 * be read from the photo or note, so the athlete's usual portion is the
 * anchor — note that 0 is a real weight and must not fall back.
 */
export function portionFor(item: PantryItem, grams: number | null): Portion {
  const weight = grams ?? item.usualGrams
  const factor = weight / 100
  return {
    grams: weight,
    calories: round1(item.per100g.calories * factor),
    protein: round1(item.per100g.protein * factor),
    carbs: round1(item.per100g.carbs * factor),
    fat: round1(item.per100g.fat * factor),
  }
}
