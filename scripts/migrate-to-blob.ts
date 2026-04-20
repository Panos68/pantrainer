// One-off migration: uploads existing data/ JSON files to Vercel Blob.
// Run with: npx dotenvx run -- npx tsx scripts/migrate-to-blob.ts
// Requires BLOB_READ_WRITE_TOKEN in .env.local

import { put } from '@vercel/blob'
import fs from 'fs'
import path from 'path'

async function migrate() {
  const dataDir = path.join(process.cwd(), 'data')
  const weeksDir = path.join(dataDir, 'weeks')

  const files = [
    { local: path.join(dataDir, 'current-week.json'), blob: 'data/current-week.json' },
    { local: path.join(dataDir, 'athlete.json'),       blob: 'data/athlete.json' },
    { local: path.join(dataDir, 'state.json'),         blob: 'data/state.json' },
  ]

  for (const { local, blob } of files) {
    if (!fs.existsSync(local)) {
      console.log(`SKIP (not found): ${local}`)
      continue
    }
    const content = fs.readFileSync(local, 'utf-8')
    await put(blob, content, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    })
    console.log(`✓ Uploaded: ${blob}`)
  }

  if (fs.existsSync(weeksDir)) {
    const weekFiles = fs.readdirSync(weeksDir).filter((f) => f.endsWith('.json'))
    for (const f of weekFiles) {
      const content = fs.readFileSync(path.join(weeksDir, f), 'utf-8')
      await put(`data/weeks/${f}`, content, {
        access: 'private',
      addRandomSuffix: false,
        contentType: 'application/json',
      })
      console.log(`✓ Uploaded: data/weeks/${f}`)
    }
  }

  console.log('\nMigration complete.')
}

migrate().catch(console.error)
