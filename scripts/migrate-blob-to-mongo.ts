import { list } from '@vercel/blob'
import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN!
const MONGODB_URI = process.env.MONGODB_URI!

async function fetchBlob(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json()
}

// Maps blob pathname → MongoDB _id
function blobPathToKey(pathname: string): string {
  const map: Record<string, string> = {
    'data/current-week.json': 'current-week',
    'data/athlete.json': 'athlete',
    'data/state.json': 'state',
    'data/automation-notes.json': 'automation-notes',
    'data/proposed/latest.json': 'proposed-latest',
    'data/pending-week.json': 'pending-week',
  }
  if (map[pathname]) return map[pathname]
  if (pathname.startsWith('data/weeks/')) {
    const filename = pathname.replace('data/weeks/', '').replace('.json', '')
    return `week/${filename}`
  }
  if (pathname.startsWith('data/proposed/history/')) {
    const filename = pathname.replace('data/proposed/history/', '').replace('.json', '')
    return `proposed-history/${filename}`
  }
  return pathname
}

async function main() {
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db('pantrainer')
  const col = db.collection('data')

  console.log('Listing all blobs...')
  const { blobs } = await list({ token: BLOB_TOKEN })
  console.log(`Found ${blobs.length} blobs`)

  for (const blob of blobs) {
    const key = blobPathToKey(blob.pathname)
    console.log(`  ${blob.pathname} → ${key}`)
    try {
      const value = await fetchBlob(blob.url)
      await col.replaceOne(
        { _id: key as never },
        { _id: key as never, value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`    ✓ saved`)
    } catch (e) {
      console.error(`    ✗ failed:`, e)
    }
  }

  console.log('\nMigration complete.')
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
