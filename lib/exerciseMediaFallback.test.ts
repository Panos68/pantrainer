import assert from 'node:assert/strict'
import index from './exercise-media/index.json'
import { findLocalMedia } from './exerciseMediaFallback'

function testFindsAKnownEntryByItsOwnName() {
  const sample = index[0]
  const result = findLocalMedia(sample.name)
  assert.notEqual(result, null, 'should find a local media entry for a name taken directly from the index')
  assert.equal(result?.slug, sample.slug)
}

function testReturnsNullForNonsenseName() {
  const result = findLocalMedia('zzzznotarealexercisezzzz')
  assert.equal(result, null)
}

testFindsAKnownEntryByItsOwnName()
testReturnsNullForNonsenseName()
console.log('lib/exerciseMediaFallback.test.ts: all assertions passed')
