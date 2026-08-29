import assert from 'node:assert/strict'
import { matchPantryItems, portionFor } from './pantry-match'
import { PANTRY_SEED } from './pantry-seed'

const kvarg = PANTRY_SEED.find((i) => i._id === 'kvarg')!

const ids = (text: string) => matchPantryItems(text, PANTRY_SEED).map((i) => i._id)

function testMatchesExactAlias() {
  assert.deepEqual(ids('kvarg'), ['kvarg'])
}

function testFindsEveryFoodNamedInASentence() {
  // A note routinely lists several foods — returning only the "best" one would
  // silently drop the rest from the day's total.
  assert.deepEqual(ids('had kvarg and granola for breakfast'), ['kvarg', 'granola-kakao'])
}

function testMatchIsCaseInsensitive() {
  assert.deepEqual(ids('Kvarg with Honey'), ['kvarg', 'honey'])
}

function testPrefersLongerAliasOverShorter() {
  // "granola kakao" and "granola" both match the same span; the more specific
  // alias must win, and must not yield two separate items.
  assert.deepEqual(ids('granola kakao'), ['granola-kakao'])
}

function testDoesNotMatchOnSubstringInsideAnotherWord() {
  // Regression guard: naive includes() would match "jam" inside "pyjamas".
  assert.deepEqual(ids('pyjamas'), [])
}

function testReturnsEmptyForUnknownFood() {
  assert.deepEqual(ids('restaurant burger and fries'), [])
}

function testDeduplicatesARepeatedMention() {
  assert.deepEqual(ids('kvarg for breakfast and kvarg again after training'), ['kvarg'])
}

function testPortionUsesUsualGramsWhenAmountUnknown() {
  const p = portionFor(kvarg, null)
  assert.equal(p.grams, 180)
  assert.equal(p.calories, 108)
}

function testPortionScalesToGivenGrams() {
  const p = portionFor(kvarg, 90)
  assert.equal(p.grams, 90)
  assert.equal(p.calories, 54)
}

function testPortionScalesMacros() {
  const p = portionFor(kvarg, 200)
  assert.equal(p.protein, 23)
  assert.equal(p.fat, 0.4)
}

function testPortionRoundsToOneDecimal() {
  // Avoid 109.19999999999999 leaking into saved estimates.
  const p = portionFor(kvarg, 182)
  assert.equal(p.calories, 109.2)
}

function testZeroGramsIsNotTreatedAsUnknown() {
  // 0 is falsy — a naive `grams || usualGrams` would silently return 180 g.
  const p = portionFor(kvarg, 0)
  assert.equal(p.grams, 0)
  assert.equal(p.calories, 0)
}

testMatchesExactAlias()
testFindsEveryFoodNamedInASentence()
testMatchIsCaseInsensitive()
testPrefersLongerAliasOverShorter()
testDoesNotMatchOnSubstringInsideAnotherWord()
testReturnsEmptyForUnknownFood()
testDeduplicatesARepeatedMention()
testPortionUsesUsualGramsWhenAmountUnknown()
testPortionScalesToGivenGrams()
testPortionScalesMacros()
testPortionRoundsToOneDecimal()
testZeroGramsIsNotTreatedAsUnknown()
console.log('lib/pantry-match.test.ts: all assertions passed')
