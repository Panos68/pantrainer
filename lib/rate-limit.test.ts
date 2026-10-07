import assert from 'node:assert/strict'
import { LOGIN_MAX_FAILURES, clientIp, loginDecision, nextFailure, type AttemptState } from './rate-limit'

const T0 = new Date('2026-10-07T12:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

function testAllowsUntilLimit() {
  let s: AttemptState | null = null
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) s = nextFailure(s, at(i * 1000))
  assert.equal(loginDecision(s, at(20_000)).allowed, true)
  s = nextFailure(s, at(21_000))
  const d = loginDecision(s, at(22_000))
  assert.equal(d.allowed, false)
  assert.ok(d.retryAfterSec > 0 && d.retryAfterSec <= 15 * 60)
}

function testWindowResets() {
  let s: AttemptState | null = null
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) s = nextFailure(s, T0)
  assert.equal(loginDecision(s, at(15 * 60 * 1000 + 1)).allowed, true)
  // A failure after the window starts a fresh count.
  assert.deepEqual(nextFailure(s, at(15 * 60 * 1000 + 1)), { failures: 1, windowStart: at(15 * 60 * 1000 + 1).toISOString() })
}

function testNoStateAllowed() {
  assert.deepEqual(loginDecision(null, T0), { allowed: true, retryAfterSec: 0 })
}

function testClientIp() {
  assert.equal(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })), '1.2.3.4')
  assert.equal(clientIp(new Request('http://x', { headers: { 'x-real-ip': '5.6.7.8' } })), '5.6.7.8')
  assert.equal(clientIp(new Request('http://x')), 'unknown')
}

testAllowsUntilLimit()
testWindowResets()
testNoStateAllowed()
testClientIp()
console.log('rate-limit tests passed')
