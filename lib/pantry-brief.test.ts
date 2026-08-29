import assert from 'node:assert/strict'
import { formatPantryBrief } from './pantry-brief'
import { PANTRY_SEED } from './pantry-seed'

function testBriefListsEveryItem() {
  const brief = formatPantryBrief(PANTRY_SEED)
  for (const item of PANTRY_SEED) {
    assert.ok(brief.includes(item.name), `brief is missing ${item.name}`)
  }
}

function testBriefCarriesDensityAndUsualPortion() {
  const brief = formatPantryBrief(PANTRY_SEED)
  assert.ok(brief.includes('60 kcal/100g'), 'kvarg density missing')
  assert.ok(brief.includes('180 g'), 'kvarg usual portion missing')
}

function testBriefCarriesTheVisualCue() {
  // Without the negative case the model reverts to guessing milk.
  assert.match(formatPantryBrief(PANTRY_SEED), /NOT milk/i)
}

function testBriefInstructsScalingAndFallThrough() {
  const brief = formatPantryBrief(PANTRY_SEED)
  assert.match(brief, /scale/i)
  assert.match(brief, /not in this list/i)
}

function testEmptyPantryProducesNoBrief() {
  // An empty pantry must not emit a stray heading with nothing under it.
  assert.equal(formatPantryBrief([]), '')
}

testBriefListsEveryItem()
testBriefCarriesDensityAndUsualPortion()
testBriefCarriesTheVisualCue()
testBriefInstructsScalingAndFallThrough()
testEmptyPantryProducesNoBrief()
console.log('lib/pantry-brief.test.ts: all assertions passed')
