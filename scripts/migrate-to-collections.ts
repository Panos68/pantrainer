/**
 * Migrates data from the flat `data` collection (first migration) into
 * the structured config / weeks / proposals collections.
 *
 * The original `data` collection is NOT deleted — run this, verify the app
 * works, then manually drop `data` from MongoDB Atlas when confident.
 */
import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI!

const CONFIG_KEYS: Record<string, string> = {
  'athlete': 'athlete',
  'state': 'state',
  'automation-notes': 'automation-notes',
  'garmin-tokens': 'garmin-tokens',
  // old key names from first migration
  'data/garmin-tokens.json': 'garmin-tokens',
}

async function main() {
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db('pantrainer')

  const all = await db.collection('data').find({}).toArray()
  console.log(`Found ${all.length} docs in 'data' collection`)

  for (const doc of all) {
    const id = doc._id as string

    if (CONFIG_KEYS[id]) {
      await db.collection('config').replaceOne(
        { _id: CONFIG_KEYS[id] as never },
        { _id: CONFIG_KEYS[id] as never, value: doc.value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`  config/${CONFIG_KEYS[id]} ✓`)
    } else if (id === 'current-week') {
      await db.collection('weeks').replaceOne(
        { _id: 'current' as never },
        { _id: 'current' as never, value: doc.value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`  weeks/current ✓`)
    } else if (id === 'pending-week') {
      await db.collection('weeks').replaceOne(
        { _id: 'pending' as never },
        { _id: 'pending' as never, value: doc.value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`  weeks/pending ✓`)
    } else if (id.startsWith('week/')) {
      const newId = id.replace('week/', 'archive-')
      await db.collection('weeks').replaceOne(
        { _id: newId as never },
        { _id: newId as never, value: doc.value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`  weeks/${newId} ✓`)
    } else if (id === 'proposed-latest') {
      await db.collection('proposals').replaceOne(
        { _id: 'latest' as never },
        { _id: 'latest' as never, value: doc.value, updatedAt: new Date() },
        { upsert: true }
      )
      console.log(`  proposals/latest ✓`)
    } else if (id.startsWith('proposed-history/') || id.startsWith('data/session-photos/')) {
      console.log(`  skipped (${id})`)
    } else {
      console.log(`  unknown key — skipped: ${id}`)
    }
  }

  console.log('\nDone. The original `data` collection is untouched.')
  console.log('Once the app works correctly, drop it from MongoDB Atlas.')
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
