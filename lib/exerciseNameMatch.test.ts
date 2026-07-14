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

testTokenize()
testFindBestMatch()
console.log('lib/exerciseNameMatch.test.ts: all assertions passed')
