import assert from 'node:assert/strict'
import { createSession } from '@/lib/auth'
import { GET } from './route'

process.env.AUTH_SESSION_SECRET = 'test-session-secret'

async function testReturnsRoleForValidSession() {
  const session = await createSession('food')
  const request = new Request('http://localhost/api/session/role', {
    headers: { cookie: `auth=${session}` },
  })
  const response = await GET(request)
  assert.deepEqual(await response.json(), { role: 'food' })
}

async function testReturnsNullRoleWithoutSession() {
  const request = new Request('http://localhost/api/session/role')
  const response = await GET(request)
  assert.deepEqual(await response.json(), { role: null })
}

async function main() {
  await testReturnsRoleForValidSession()
  await testReturnsNullRoleWithoutSession()
  console.log('app/api/session/role/route.test.ts: all assertions passed')
}

void main()
