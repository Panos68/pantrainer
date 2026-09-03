import assert from 'node:assert/strict'
import { createSession, parseSession, roleForPassword } from './auth'

const originalEnvironment = { ...process.env }
process.env.AUTH_SESSION_SECRET = 'test-session-secret'
process.env.AUTH_PASSWORD = 'owner-password'
process.env.FOOD_ACCESS_PASSWORD = 'food-password'

async function testSessionsRoundTrip() {
  const now = Date.now()
  const session = await createSession('food', now)
  assert.deepEqual(await parseSession(session, now), {
    role: 'food',
    issuedAt: now,
    expiresAt: now + 60 * 60 * 24 * 365 * 1000,
  })
}

async function testSessionsRejectTamperingAndExpiry() {
  const now = Date.now()
  const session = await createSession('owner', now)
  assert.equal(await parseSession(`${session}x`, now), null)
  assert.equal(await parseSession(session, now + 60 * 60 * 24 * 365 * 1000 + 1), null)
}

async function testPasswordsResolveToRoles() {
  assert.equal(await roleForPassword('owner-password'), 'owner')
  assert.equal(await roleForPassword('food-password'), 'food')
  assert.equal(await roleForPassword('wrong-password'), null)
}

async function testMissingFoodPasswordCannotAuthenticate() {
  delete process.env.FOOD_ACCESS_PASSWORD
  assert.equal(await roleForPassword('food-password'), null)
  process.env.FOOD_ACCESS_PASSWORD = 'food-password'
}

async function main() {
  try {
    await testSessionsRoundTrip()
    await testSessionsRejectTamperingAndExpiry()
    await testPasswordsResolveToRoles()
    await testMissingFoodPasswordCannotAuthenticate()
    console.log('lib/auth.test.ts: all assertions passed')
  } finally {
    Object.assign(process.env, originalEnvironment)
  }
}

void main()
