// scripts/seed-demo.ts
// Fills the database at MONGODB_URI with deterministic demo data (12 weeks of
// fake training) for a demo instance or screenshots.
//
// SAFETY: refuses to run against a database that already holds data unless
// that database was itself created by this script (it leaves a
// `demo-instance` marker in the config collection). It can never wipe a real
// athlete's instance.
//
// Run:  MONGODB_URI=... npx tsx scripts/seed-demo.ts
import { getDb } from '../lib/mongodb'
import { generateDemoData } from '../lib/demo-data'
import { PANTRY_SEED } from '../lib/pantry-seed'

const DEMO_COLLECTIONS = ['weeks', 'config', 'pantry', 'nutrition_log', 'coach_notes', 'food_notes', 'food_inventory', 'proposals']
const MARKER = 'demo-instance'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const db = await getDb()
  const marker = await db.collection('config').findOne({ _id: MARKER as never })
  const existingWeeks = await db.collection('weeks').countDocuments()
  if (!marker && existingWeeks > 0) {
    console.error('Refusing to seed: this database already has training data and is not a demo instance.')
    process.exit(1)
  }

  for (const name of DEMO_COLLECTIONS) await db.collection(name).deleteMany({})

  const data = generateDemoData(todayIso())
  const now = new Date()
  await db.collection('weeks').insertMany([
    ...data.archived.map(({ id, week }) => ({ _id: id as never, value: week, updatedAt: now })),
    { _id: 'current' as never, value: data.current, updatedAt: now },
  ])
  await db.collection('config').insertMany([
    { _id: 'athlete' as never, value: data.profile, updatedAt: now },
    { _id: MARKER as never, value: true, updatedAt: now },
  ])
  await db.collection('pantry').insertMany(PANTRY_SEED as never[])

  console.log(`Seeded ${data.archived.length} archived weeks + current week for "${data.profile.name}".`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
