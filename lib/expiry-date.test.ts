import assert from 'node:assert/strict'
import { extractExpiryDate } from './expiry-date'

assert.equal(extractExpiryDate('Bast fore 14.09.26'), '2026-09-14')
assert.equal(extractExpiryDate('Use by 14/09/2026'), '2026-09-14')
assert.equal(extractExpiryDate('Best before 14 SEP 2026'), '2026-09-14')
assert.equal(extractExpiryDate('14.19.26'), null)
assert.equal(extractExpiryDate('LOT 934829'), null)
console.log('lib/expiry-date.test.ts: all assertions passed')
