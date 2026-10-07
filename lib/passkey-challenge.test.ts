import assert from 'node:assert/strict'
import { CHALLENGE_TTL_MS, openChallenge, relyingParty, sealChallenge } from './passkey-challenge'

const NOW = 1_800_000_000_000

function testRoundTrip() {
  const sealed = sealChallenge('abc', 'login', 's', NOW)
  assert.equal(openChallenge(sealed, 'login', 's', NOW + 1000), 'abc')
}

function testRejects() {
  const sealed = sealChallenge('abc', 'login', 's', NOW)
  assert.equal(openChallenge(sealed, 'register', 's', NOW), null, 'purpose mismatch')
  assert.equal(openChallenge(sealed, 'login', 'other', NOW), null, 'wrong secret')
  assert.equal(openChallenge(sealed, 'login', '', NOW), null, 'empty secret')
  assert.equal(openChallenge(sealed, 'login', 's', NOW + CHALLENGE_TTL_MS + 1), null, 'expired')
  assert.equal(openChallenge(undefined, 'login', 's', NOW), null)
  assert.equal(openChallenge('nodot', 'login', 's', NOW), null)
  const [payload, sig] = sealed.split('.')
  const forged = Buffer.from(JSON.stringify({ challenge: 'evil', purpose: 'login', exp: NOW + 9e9 })).toString('base64url')
  assert.equal(openChallenge(`${forged}.${sig}`, 'login', 's', NOW), null, 'tampered')
  assert.ok(payload)
  assert.throws(() => sealChallenge('abc', 'login', '', NOW))
}

function testRelyingParty() {
  assert.deepEqual(relyingParty(new Request('https://pantrainer.example.com/api/auth/passkey/login-options')), {
    rpID: 'pantrainer.example.com',
    origin: 'https://pantrainer.example.com',
  })
}

testRoundTrip()
testRejects()
testRelyingParty()
console.log('passkey-challenge tests passed')
