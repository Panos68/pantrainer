import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contentTypeFor, getStorage, isSafeKey, localStorageDriver } from './storage'

function testSafeKeys() {
  assert.equal(isSafeKey('data/food-photos/2026-10-07/1-a.jpg'), true)
  assert.equal(isSafeKey('../etc/passwd'), false)
  assert.equal(isSafeKey('data/../../x'), false)
  assert.equal(isSafeKey('/abs/path'), false)
  assert.equal(isSafeKey('data//x'), false)
  assert.equal(isSafeKey(''), false)
  assert.equal(contentTypeFor('a/b.JPG'), 'image/jpeg')
  assert.equal(contentTypeFor('a/b.bin'), 'application/octet-stream')
}

async function testLocalDriverRoundTrip() {
  const root = await mkdtemp(path.join(tmpdir(), 'pantrainer-storage-'))
  try {
    const store = localStorageDriver(root)
    await store.put('data/food-photos/2026-10-07/1-a.jpg', Buffer.from('abc'), 'image/jpeg')
    await store.put('data/food-photos/2026-10-08/2-b.png', new Blob(['xy']), 'image/png')
    await store.put('data/session-photos/2026-10-07/3-c.jpg', Buffer.from('z'), 'image/jpeg')

    const got = await store.get('data/food-photos/2026-10-07/1-a.jpg')
    assert.equal(Buffer.from(got!.body).toString(), 'abc')
    assert.equal(got!.contentType, 'image/jpeg')
    assert.equal(await store.get('data/food-photos/missing.jpg'), null)

    const day = await store.list('data/food-photos/2026-10-07/')
    assert.deepEqual(day.map((o) => o.pathname), ['data/food-photos/2026-10-07/1-a.jpg'])
    const all = (await store.list('data/food-photos/')).map((o) => o.pathname).sort()
    assert.deepEqual(all, ['data/food-photos/2026-10-07/1-a.jpg', 'data/food-photos/2026-10-08/2-b.png'])
    assert.deepEqual(await store.list('data/nothing-here/'), [])

    await store.del(['data/food-photos/2026-10-07/1-a.jpg', 'data/food-photos/never-existed.jpg'])
    assert.equal(await store.get('data/food-photos/2026-10-07/1-a.jpg'), null)

    await assert.rejects(() => store.get('../outside.txt'), /Invalid storage path/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function testDriverSelection() {
  const prev = { token: process.env.BLOB_READ_WRITE_TOKEN, dir: process.env.STORAGE_DIR }
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.STORAGE_DIR
  assert.equal(getStorage(), null)
  process.env.STORAGE_DIR = '/tmp/x'
  assert.equal(getStorage()?.kind, 'local')
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret'
  assert.equal(getStorage()?.kind, 'vercel-blob')
  if (prev.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
  else process.env.BLOB_READ_WRITE_TOKEN = prev.token
  if (prev.dir === undefined) delete process.env.STORAGE_DIR
  else process.env.STORAGE_DIR = prev.dir
}

async function main() {
  testSafeKeys()
  await testLocalDriverRoundTrip()
  testDriverSelection()
  console.log('storage tests passed')
}
void main()
