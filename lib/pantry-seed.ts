import type { PantryItem } from './schema'

// Seeded from the athlete's food-scale app, which is weighed ground truth.
// Calorie densities are directly observed. The protein/carb/fat splits for
// kvarg and keso are derived by subtracting known co-items from logged meal
// totals, so they are close but not label-exact — the pantry UI flags seeded
// items for confirmation against the package.
const SEEDED_AT = '2026-08-29T00:00:00.000Z'

function seed(
  _id: string,
  name: string,
  aliases: string[],
  visualCue: string,
  per100g: PantryItem['per100g'],
  usualGrams: number,
): PantryItem {
  return { _id, name, aliases, visualCue, per100g, usualGrams, source: 'seeded', updatedAt: SEEDED_AT }
}

export const PANTRY_SEED: PantryItem[] = [
  seed('kvarg', 'Kvarg', ['kvarg', 'kvarg vanilj', 'kvark'],
    'Thick white spoonable dairy in a plastic tub or bowl. This athlete eats kvarg — NOT milk, NOT plain yogurt, NOT skyr.',
    { calories: 60, protein: 11.5, carbs: 3, fat: 0.2 }, 180),
  seed('keso', 'Keso', ['keso', 'cottage cheese'],
    'White lumpy cottage cheese, visibly curded — distinct from the smooth texture of kvarg.',
    { calories: 100, protein: 13.9, carbs: 3.8, fat: 2.5 }, 144),
  seed('granola-kakao', 'Granola kakao', ['granola', 'granola kakao', 'kakao granola'],
    'Dark cocoa granola clusters, usually sprinkled over kvarg or keso rather than eaten as a bowl of cereal.',
    { calories: 415, protein: 10, carbs: 55, fat: 16 }, 27),
  seed('havre-fras', 'Havre fras', ['havre fras', 'havrefras'],
    'Small crisp oat cereal squares, eaten as a topping in small amounts.',
    { calories: 390, protein: 9, carbs: 66, fat: 7 }, 20),
  seed('kefir', 'Kefir', ['kefir'],
    'Pourable cultured milk drink — thinner than kvarg, poured rather than spooned.',
    { calories: 54, protein: 3.3, carbs: 4, fat: 2.5 }, 48),
  seed('paleo-nuts', 'Paleo nuts', ['paleo nuts', 'nuts', 'nötter'],
    'Mixed nut snack, eaten in small handfuls. Very calorie dense — portion accuracy matters more here than elsewhere.',
    { calories: 596, protein: 20, carbs: 8, fat: 52 }, 23),
  seed('whey-protein-star', 'Whey protein star', ['whey', 'whey protein', 'protein powder', 'proteinpulver'],
    'Protein powder, mixed into a shake or stirred into kvarg. Not visible as a food in photos — usually only mentioned in notes.',
    { calories: 364, protein: 87, carbs: 1, fat: 0 }, 30),
  seed('honey', 'Honey', ['honey', 'honung'],
    'Drizzled over kvarg or keso in very small amounts — grams, not spoonfuls.',
    { calories: 304, protein: 0.3, carbs: 82, fat: 0 }, 2),
  seed('jam', 'Jam', ['jam', 'sylt', 'marmalade'],
    'Fruit jam, a small spoon stirred into dairy.',
    { calories: 150, protein: 0.4, carbs: 37, fat: 0.1 }, 7),
]
