import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { AUTH_CODE_TTL_MS, signAuthCode, verifyAuthCode, verifyPkce } from './oauth'

const SECRET = 'session-secret'
const NOW = 1_800_000_000_000
const base = { redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: 'c1', code_challenge: 'ch' }

function testRoundTrip() {
  const code = signAuthCode(base, SECRET, NOW)
  const p = verifyAuthCode(code, SECRET, NOW + 1000)
  assert.ok(p)
  assert.equal(p.redirect_uri, base.redirect_uri)
  assert.equal(p.client_id, 'c1')
  assert.equal(p.code_challenge, 'ch')
}

function testRejectsTamperExpiryAndWrongSecret() {
  const code = signAuthCode(base, SECRET, NOW)
  assert.equal(verifyAuthCode(code, SECRET, NOW + AUTH_CODE_TTL_MS + 1), null)
  assert.equal(verifyAuthCode(code, 'other', NOW), null)
  assert.equal(verifyAuthCode(code, '', NOW), null)
  const [payload, sig] = code.split('.')
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), redirect_uri: 'https://evil.example/cb' })).toString('base64url')
  assert.equal(verifyAuthCode(`${forged}.${sig}`, SECRET, NOW), null)
  assert.equal(verifyAuthCode('garbage', SECRET, NOW), null)
  assert.throws(() => signAuthCode(base, '', NOW))
}

function testPkce() {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  assert.equal(verifyPkce(verifier, challenge), true)
  assert.equal(verifyPkce(verifier + 'x', challenge), false)
  assert.equal(verifyPkce('', challenge), false)
}

testRoundTrip()
testRejectsTamperExpiryAndWrongSecret()
testPkce()
console.log('oauth tests passed')
