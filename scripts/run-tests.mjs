// Runs every *.test.ts under lib/ and app/ with tsx, one process per file
// (tests are plain node:assert scripts). Needs no secrets or database.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) collect(path, out)
    else if (entry.endsWith('.test.ts')) out.push(path)
  }
  return out
}

const files = [...collect('lib'), ...collect('app')].sort()
const failed = []
for (const file of files) {
  const res = spawnSync('npx', ['tsx', file], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } })
  if (res.status !== 0) failed.push(file)
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`)
if (failed.length > 0) {
  console.error(`Failed:\n  ${failed.join('\n  ')}`)
  process.exit(1)
}
