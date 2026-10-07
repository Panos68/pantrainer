import assert from 'node:assert/strict'
import {
  BEARER_KINDS,
  generateToken,
  hashToken,
  isTokenUsable,
  shouldTouchLastUsed,
  type ApiTokenDoc,
} from './api-tokens'

const NOW = new Date('2026-10-07T12:00:00.000Z')

function doc(over: Partial<ApiTokenDoc> = {}): ApiTokenDoc {
  return {
    _id: 'h', kind: 'personal', name: 'n', grantId: null,
    createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null,
    expiresAt: null, revokedAt: null, ...over,
  }
}

function testGenerateTokenFormat() {
  const a = generateToken()
  const b = generateToken()
  assert.match(a, /^pt_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, b)
}

function testHashIsStableHexAndNotRaw() {
  const h = hashToken('pt_abc')
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.equal(h, hashToken('pt_abc'))
  assert.notEqual(h, hashToken('pt_abd'))
}

function testUsability() {
  assert.equal(isTokenUsable(doc(), NOW, BEARER_KINDS), true)
  assert.equal(isTokenUsable(doc({ revokedAt: '2026-10-02T00:00:00.000Z' }), NOW, BEARER_KINDS), false)
  assert.equal(isTokenUsable(doc({ kind: 'oauth_access', expiresAt: '2026-10-07T11:59:59.000Z' }), NOW, BEARER_KINDS), false)
  assert.equal(isTokenUsable(doc({ kind: 'oauth_access', expiresAt: '2026-10-08T00:00:00.000Z' }), NOW, BEARER_KINDS), true)
  // Refresh tokens are never bearers.
  assert.equal(isTokenUsable(doc({ kind: 'oauth_refresh' }), NOW, BEARER_KINDS), false)
  assert.equal(isTokenUsable(doc({ kind: 'oauth_refresh' }), NOW, ['oauth_refresh']), true)
}

function testLastUsedThrottle() {
  assert.equal(shouldTouchLastUsed(doc(), NOW), true)
  assert.equal(shouldTouchLastUsed(doc({ lastUsedAt: '2026-10-07T11:55:00.000Z' }), NOW), false)
  assert.equal(shouldTouchLastUsed(doc({ lastUsedAt: '2026-10-07T11:49:00.000Z' }), NOW), true)
}

testGenerateTokenFormat()
testHashIsStableHexAndNotRaw()
testUsability()
testLastUsedThrottle()
console.log('api-tokens tests passed')
