import assert from 'node:assert/strict'
import { signPath, verifyPathSignature } from './signed-url'

const NOW = 1_800_000_000
const sig = signPath('data/session-photos/a.jpg', NOW + 60, 's')
assert.equal(verifyPathSignature('data/session-photos/a.jpg', String(NOW + 60), sig, 's', NOW), true)
assert.equal(verifyPathSignature('data/session-photos/b.jpg', String(NOW + 60), sig, 's', NOW), false)
assert.equal(verifyPathSignature('data/session-photos/a.jpg', String(NOW + 60), sig, 's', NOW + 61), false)
assert.equal(verifyPathSignature('data/session-photos/a.jpg', String(NOW + 60), sig, '', NOW), false)
assert.equal(verifyPathSignature('data/session-photos/a.jpg', null, sig, 's', NOW), false)
assert.equal(verifyPathSignature('data/session-photos/a.jpg', String(NOW + 60), 'zz', 's', NOW), false)
console.log('signed-url tests passed')
