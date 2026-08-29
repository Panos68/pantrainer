import type { PantryItem } from './schema'

/**
 * Render the pantry as an instruction block for the estimator. This rides along
 * in the list_food_photos_for_range response rather than sitting behind its own
 * tool, so an unattended scheduled run cannot skip it.
 */
export function formatPantryBrief(pantry: PantryItem[]): string {
  if (pantry.length === 0) return ''

  const lines = pantry.map((i) => {
    const usualKcal = Math.round((i.per100g.calories * i.usualGrams) / 100)
    return [
      `- ${i.name} (${i.aliases.join(', ')})`,
      `    ${i.per100g.calories} kcal/100g | P ${i.per100g.protein} | C ${i.per100g.carbs} | F ${i.per100g.fat}`,
      `    usual portion: ${i.usualGrams} g (~${usualKcal} kcal)`,
      `    ${i.visualCue}`,
    ].join('\n')
  })

  return [
    "THE ATHLETE'S STAPLE FOODS — check these BEFORE estimating any item.",
    '',
    ...lines,
    '',
    'How to use this list:',
    '1. For each food in a photo or note, first ask whether it is one of the above.',
    '   Match only on positive evidence. If a food merely resembles a staple but',
    '   something contradicts it, estimate it normally and say the match was unsure.',
    '2. If the amount looks like the usual portion, use the usual portion figures',
    '   as-is. This is what keeps repeat meals from drifting between days.',
    '3. If the amount clearly differs, scale from the per-100g values and say so',
    '   in the description (e.g. "kvarg, roughly double the usual bowl, ~360 g").',
    '4. A food that is not in this list is estimated exactly as you would',
    '   otherwise — eating out and one-off meals are still your own judgement.',
    '   Never drop an item from the day total just because it is not a staple.',
  ].join('\n')
}
