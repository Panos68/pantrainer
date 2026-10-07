import assert from 'node:assert/strict'
import { clearPending, flushPending, mergePending, patchSession, readPending, type KeyValueStore } from './offlineSessionSync'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v) },
    removeItem: (k) => { data.delete(k) },
  }
}

const ok = async () => new Response('{}', { status: 200 })
const offline = async (): Promise<Response> => { throw new TypeError('Failed to fetch') }

async function testOfflineStoresAndMerges() {
  const store = memoryStore()
  const r1 = await patchSession(store, 'monday', { exercises: [1] }, offline)
  assert.deepEqual(r1, { ok: false, offline: true })
  await patchSession(store, 'monday', { exercises: [1, 2] }, offline)
  await patchSession(store, 'monday', { status: 'completed', rpe: 8 }, offline)
  assert.deepEqual(readPending(store, 'monday'), { exercises: [1, 2], status: 'completed', rpe: 8 })
  assert.equal(readPending(store, 'tuesday'), null)
}

async function testOnlineSendsMergedBodyAndClears() {
  const store = memoryStore()
  mergePending(store, 'monday', { exercises: [1] })
  const sent: unknown[] = []
  const r = await patchSession(store, 'monday', { rpe: 7 }, async (body) => { sent.push(body); return ok() })
  assert.equal(r.ok, true)
  assert.deepEqual(sent, [{ exercises: [1], rpe: 7 }])
  assert.equal(readPending(store, 'monday'), null)
}

async function testServerErrorIsNotOffline() {
  const store = memoryStore()
  const r = await patchSession(store, 'monday', { exercises: [] }, async () => new Response('no', { status: 409 }))
  assert.equal(r.ok, false)
  assert.equal(r.offline, false)
  assert.equal(readPending(store, 'monday'), null)
}

async function testFlush() {
  const store = memoryStore()
  assert.equal(await flushPending(store, 'monday', ok), true)
  mergePending(store, 'monday', { exercises: [3] })
  assert.equal(await flushPending(store, 'monday', offline), false)
  assert.notEqual(readPending(store, 'monday'), null)
  assert.equal(await flushPending(store, 'monday', ok), true)
  assert.equal(readPending(store, 'monday'), null)
  clearPending(store, 'monday')
}

async function testCorruptStorageIsIgnored() {
  const store = memoryStore()
  store.setItem('pending-session-patch:monday', '{not json')
  assert.equal(readPending(store, 'monday'), null)
}

async function main() {
  await testOfflineStoresAndMerges()
  await testOnlineSendsMergedBodyAndClears()
  await testServerErrorIsNotOffline()
  await testFlush()
  await testCorruptStorageIsIgnored()
  console.log('offlineSessionSync tests passed')
}
void main()
