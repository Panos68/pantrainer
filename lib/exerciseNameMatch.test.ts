import assert from 'node:assert/strict'
import { tokenize, findBestMatch } from './exerciseNameMatch'

function testTokenize() {
  assert.deepEqual(tokenize('DB Romanian-Deadlift'), ['dumbbell', 'romanian', 'deadlift'])
  assert.deepEqual(tokenize('Bench Press'), ['bench', 'press'])
}

function testFindBestMatch() {
  const items = [
    { name: 'Barbell Romanian Deadlift' },
    { name: 'Romanian Deadlift' },
    { name: 'Deadlift' },
  ]
  const getName = (i: { name: string }) => i.name
  const result = findBestMatch(items, 'Romanian deadlift', getName)
  assert.equal(result?.name, 'Romanian Deadlift', 'prefers the exact core match over the barbell variant when no equipment word is given')

  assert.equal(findBestMatch(items, 'Bulgarian split squat', getName), null, 'returns null when nothing matches')
}

function testToleratesExtraQualifierWords() {
  const items = [{ name: 'Seated Leg Curl' }, { name: 'Face Pull' }]
  const getName = (i: { name: string }) => i.name
  assert.equal(
    findBestMatch(items, 'Seated Leg Curl Machine', getName)?.name,
    'Seated Leg Curl',
    'an extra equipment-style qualifier in the search name (e.g. "Machine") should not block a match',
  )
  assert.equal(
    findBestMatch(items, 'Cable Face Pull', getName)?.name,
    'Face Pull',
    'an extra equipment word in the search name (e.g. "Cable") should not block a match',
  )
}

function testTreatsPluralsAsEquivalent() {
  const items = [{ name: 'Hip Circles (prone)' }]
  const getName = (i: { name: string }) => i.name
  assert.equal(findBestMatch(items, 'Hip Circle', getName)?.name, 'Hip Circles (prone)')
}

testTokenize()
testFindBestMatch()
testToleratesExtraQualifierWords()
testTreatsPluralsAsEquivalent()
console.log('lib/exerciseNameMatch.test.ts: all assertions passed')
