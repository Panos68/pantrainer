// One-time/occasional data vendoring script — not part of the app runtime.
// Pulls Garmin's real structured-workout exercise catalog (name, category,
// exerciseName) from the python-garminconnect project, which maintains it
// from Garmin's own app data. Used to ground exercise_garmin_map bootstrap
// entries (and future MCP save_garmin_exercise_mapping calls) in real
// catalog values instead of guessing.
// Run manually: npx tsx scripts/import-garmin-exercise-catalog.ts
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const SOURCE_URL =
  'https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/exercises.py'
const OUT_PATH = path.join(process.cwd(), 'lib', 'garmin-exercise-catalog.json')

type CatalogEntry = { name: string; category: string; exerciseName: string }

// Matches each ("Display Name", "CATEGORY", "EXERCISE_NAME") tuple, tolerant
// of the source's multi-line formatting for long entries.
const TUPLE_RE = /\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\)/g

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Failed to fetch catalog source: ${res.status}`)
  const src = await res.text()

  const entries: CatalogEntry[] = []
  for (const m of src.matchAll(TUPLE_RE)) {
    entries.push({ name: m[1], category: m[2], exerciseName: m[3] })
  }

  if (entries.length < 1000) {
    throw new Error(`Parsed only ${entries.length} entries — parser likely broke, aborting write`)
  }

  await writeFile(OUT_PATH, JSON.stringify(entries, null, 2))
  console.log(`Wrote ${entries.length} entries to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
