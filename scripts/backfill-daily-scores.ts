// scripts/backfill-daily-scores.ts
// Recomputes every daily_scores entry (current + archived weeks) under
// recovery-score v2. Required because calc7dBaseline averages saved scores —
// mixing v1/v2 totals in one trailing window would corrupt the delta shown
// on RecoveryScorePanel for weeks straddling the cutover.
//
// Run (dry run first): npx dotenvx run -f .env.local -- npx tsx scripts/backfill-daily-scores.ts --dry-run
// Then for real:       npx dotenvx run -f .env.local -- npx tsx scripts/backfill-daily-scores.ts
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

// lib/data.ts wraps some reads (e.g. the archived-week-id lookup) in
// unstable_cache, which requires a Next.js request/build context: it needs
// (a) globalThis.AsyncLocalStorage to exist (Next's own server bootstrap
// sets this; Node doesn't expose it as a global by default) and (b) an
// incrementalCache to store into. A standalone `tsx` invocation has
// neither, so unstable_cache throws. Next.js supports both as documented
// globalThis fallbacks. Wire up (a) plus a minimal no-op cache for (b) so
// those reads work in a bare script — a no-op cache (always miss, never
// persists) is exactly what a one-off backfill wants anyway: fresh,
// uncached reads of every archived week.
;(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage
;(globalThis as unknown as { __incrementalCache?: unknown }).__incrementalCache = {
  generateCacheKey: async (key: string) => crypto.createHash('sha256').update(key).digest('hex'),
  get: async () => null,
  set: async () => {},
  isOnDemandRevalidate: false,
}

import { computeDailyScore } from '../lib/daily-score'
import type { WeekDoc } from '../lib/schema'

// lib/data.ts imports next/cache (for unstable_cache/revalidateTag) at its
// top, which eagerly initializes Next's AsyncLocalStorage singleton on
// first import. Static imports are hoisted above the globalThis shims
// above, so lib/data must be imported dynamically, after those shims run,
// or the shims are a no-op and we're back to the original crash.
type DataModule = typeof import('../lib/data')
let dataModule: DataModule

async function backfillWeek(week: WeekDoc, allWeeksForContext: WeekDoc[], label: string, dryRun: boolean): Promise<WeekDoc> {
  const dates = Object.keys(week.daily_scores ?? {})
  let changed = 0
  const nextScores = { ...week.daily_scores }
  for (const date of dates) {
    // archivedWeeks passed to computeDailyScore must exclude `week` itself
    // (it's concatenated with week.sessions internally) — pass every OTHER
    // week as context so ACWR/baselines see full history regardless of which
    // week `date` falls in.
    const contextWeeks = allWeeksForContext.filter((w) => w !== week)
    const recomputed = computeDailyScore(date, week, contextWeeks)
    if (JSON.stringify(recomputed) !== JSON.stringify(nextScores[date])) changed++
    nextScores[date] = recomputed
  }
  console.log(`${label}: ${dates.length} days, ${changed} changed`)
  return { ...week, daily_scores: nextScores }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { readCurrentWeekDirect, writeCurrentWeek, readAllArchivedWeeksWithIds, writeArchivedWeek } = dataModule

  const current = await readCurrentWeekDirect()
  const archivedWithIds = await readAllArchivedWeeksWithIds()
  const allWeeks = [...archivedWithIds.map((a) => a.week), ...(current ? [current] : [])]

  if (current) {
    const updated = await backfillWeek(current, allWeeks, 'current', dryRun)
    if (!dryRun) await writeCurrentWeek(updated)
  }

  for (const { id, week } of archivedWithIds) {
    const updated = await backfillWeek(week, allWeeks, id, dryRun)
    if (!dryRun) await writeArchivedWeek(id, updated)
  }

  console.log(dryRun ? 'DRY RUN — nothing written' : 'Backfill complete')
}

import('../lib/data').then((mod) => {
  dataModule = mod
  return main()
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
