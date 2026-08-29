import assert from 'node:assert/strict'
import { PantryItemSchema } from './schema'
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

testSeedItemsAllParse()
testSeedHasKvargWithObservedDensity()
testVisualCuesNameTheConfusableFoods()
testAliasesAreLowercase()
console.log('lib/pantry.test.ts: all assertions passed')
