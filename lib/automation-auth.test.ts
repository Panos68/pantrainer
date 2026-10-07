import assert from 'node:assert/strict'
import { checkBearer, isCronAuthorized, parseBearer } from './automation-auth'

const noLookup = async () => null

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/x', { headers })
}

async function testParseBearer() {
  assert.equal(parseBearer(req()), null)
  assert.equal(parseBearer(req({ authorization: 'Basic abc' })), null)
  assert.equal(parseBearer(req({ authorization: 'Bearer ' })), null)
  assert.equal(parseBearer(req({ authorization: 'Bearer pt_abc' })), 'pt_abc')
  // iOS Shortcuts sometimes append whitespace/newlines to header values.
  assert.equal(parseBearer(req({ authorization: 'Bearer legacy-token \n' })), 'legacy-token')
}

async function testLegacyTokenStillWorks() {
  assert.equal(await checkBearer('legacy-token', 'legacy-token', noLookup), true)
  assert.equal(await checkBearer('legacy-tokeN', 'legacy-token', noLookup), false)
  assert.equal(await checkBearer(null, 'legacy-token', noLookup), false)
  // No legacy env configured: an empty token must never match.
  assert.equal(await checkBearer('', undefined, noLookup), false)
}

async function testDbTokens() {
  const seen: string[] = []
  const lookup = async (t: string) => { seen.push(t); return t === 'pt_good' ? { _id: 'x' } : null }
  assert.equal(await checkBearer('pt_good', undefined, lookup), true)
  assert.equal(await checkBearer('pt_bad', 'legacy-token', lookup), false)
  assert.deepEqual(seen, ['pt_good', 'pt_bad'])
}

async function testCron() {
  const prev = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  assert.equal(isCronAuthorized(req({ authorization: 'Bearer undefined' })), false)
  process.env.CRON_SECRET = 'cron-s'
  assert.equal(isCronAuthorized(req({ authorization: 'Bearer cron-s' })), true)
  assert.equal(isCronAuthorized(req({ authorization: 'Bearer cron-x' })), false)
  if (prev === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = prev
}

async function main() {
  await testParseBearer()
  await testLegacyTokenStillWorks()
  await testDbTokens()
  await testCron()
  console.log('automation-auth tests passed')
}
void main()
