// One-time/occasional data vendoring script — not part of the app runtime.
// Run manually: npx tsx scripts/import-exercise-media.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DATASET_JSON_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const RAW_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

type UpstreamExercise = {
  id: string
  name: string
  images: string[]
}

async function downloadImage(relativePath: string, destPath: string): Promise<boolean> {
  const url = `${RAW_IMAGE_BASE}${relativePath}`
  const res = await fetch(url)
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(path.dirname(destPath), { recursive: true })
  await writeFile(destPath, buf)
  return true
}

async function main() {
  const res = await fetch(DATASET_JSON_URL)
  if (!res.ok) throw new Error(`Failed to fetch dataset JSON: ${res.status}`)
  const upstream = (await res.json()) as UpstreamExercise[]

  const index: Array<{ name: string; slug: string; images: string[] }> = []
  const outRoot = path.join(process.cwd(), 'public', 'exercise-media')

  for (const ex of upstream) {
    if (!ex.images || ex.images.length === 0) continue
    const slug = ex.id
    const savedImages: string[] = []
    for (const relPath of ex.images) {
      // relPath looks like "3_4_Sit-Up/0.jpg"
      const destPath = path.join(outRoot, relPath)
      const ok = await downloadImage(relPath, destPath)
      if (ok) savedImages.push(relPath)
    }
    if (savedImages.length > 0) {
      index.push({ name: ex.name, slug, images: savedImages })
    }
  }

  const indexDir = path.join(process.cwd(), 'lib', 'exercise-media')
  await mkdir(indexDir, { recursive: true })
  await writeFile(path.join(indexDir, 'index.json'), JSON.stringify(index, null, 2))

  await writeFile(
    path.join(outRoot, 'ATTRIBUTION.md'),
    '# Exercise Media Attribution\n\n' +
      'Images vendored from the Free Exercise DB dataset ' +
      '(https://github.com/yuhonas/free-exercise-db, Unlicense / public domain). ' +
      'Used here for a personal, non-commercial app.\n',
  )

  console.log(`Imported ${index.length} exercises with images.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
