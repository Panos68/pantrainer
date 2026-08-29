import assert from 'node:assert/strict'
import { PantryItemSchema, NutritionLogEntrySchema } from './schema'
import { PANTRY_SEED } from './pantry-seed'

function testSeedItemsAllParse() {
  for (const item of PANTRY_SEED) {
    assert.doesNotThrow(() => PantryItemSchema.parse(item), `seed item ${item._id} failed to parse`)
  }
}

function testSeedHasKvargWithObservedDensity() {
  const kvarg = PANTRY_SEED.find((i) => i._id === 'kvarg')
  assert.ok(kvarg, 'kvarg must be seeded — it is the regression case')
  // Derived from two weighings: 182 g -> 109.2 kcal and 178 g -> 106.8 kcal.
  assert.equal(kvarg.per100g.calories, 60)
  assert.equal(kvarg.usualGrams, 180)
}

function testVisualCuesNameTheConfusableFoods() {
  // The failure mode is a confident WRONG match, so the cue must carry the
  // negative case, not just a description.
  const kvarg = PANTRY_SEED.find((i) => i._id === 'kvarg')!
  assert.match(kvarg.visualCue, /NOT milk/i)
}

function testAliasesAreLowercase() {
  // Matching is done on lowercased note text; uppercase aliases would never hit.
  for (const item of PANTRY_SEED) {
    for (const alias of item.aliases) {
      assert.equal(alias, alias.toLowerCase(), `alias "${alias}" on ${item._id} must be lowercase`)
    }
  }
}

function testEntryAcceptsItemBreakdown() {
  const entry = NutritionLogEntrySchema.parse({
    _id: '2026-08-29',
    estimatedCalories: 187,
    macros: { protein: 22.8, carbs: 18.6, fat: 1.8 },
    meals: [{
      name: 'Breakfast',
      calories: 187,
      macros: { protein: 22.8, carbs: 18.6, fat: 1.8 },
      items: [
        { name: 'Havre fras', grams: 20, calories: 78, pantryId: 'havre-fras' },
        { name: 'Kvarg', grams: 182, calories: 109.2, pantryId: 'kvarg' },
      ],
    }],
    description: 'kvarg with havre fras',
    analyzedAt: '2026-08-29T06:00:00.000Z',
  })
  assert.equal(entry.meals?.[0].items?.[1].grams, 182)
}

function testEntryWithoutItemsStillParses() {
  // Every existing saved estimate predates items[] — none may break.
  const entry = NutritionLogEntrySchema.parse({
    _id: '2026-08-28',
    estimatedCalories: 2542,
    macros: { protein: 120, carbs: 300, fat: 80 },
    meals: [{ name: 'Lunch', calories: 800, macros: null }],
    description: 'legacy entry',
    analyzedAt: '2026-08-28T12:00:00.000Z',
  })
  assert.equal(entry.meals?.[0].items, undefined)
}

function testOneOffFoodHasNullPantryId() {
  const entry = NutritionLogEntrySchema.parse({
    _id: '2026-08-29',
    estimatedCalories: 650,
    macros: null,
    meals: [{
      name: 'Dinner',
      calories: 650,
      macros: null,
      items: [{ name: 'Restaurant burger', grams: 300, calories: 650, pantryId: null }],
    }],
    description: 'ate out',
    analyzedAt: '2026-08-29T20:00:00.000Z',
  })
  assert.equal(entry.meals?.[0].items?.[0].pantryId, null)
}

testSeedItemsAllParse()
testSeedHasKvargWithObservedDensity()
testVisualCuesNameTheConfusableFoods()
testAliasesAreLowercase()
testEntryAcceptsItemBreakdown()
testEntryWithoutItemsStillParses()
testOneOffFoodHasNullPantryId()
console.log('lib/pantry.test.ts: all assertions passed')
