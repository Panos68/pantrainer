# Garmin Connect Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fill session logs from Garmin activities, show daily recovery data (sleep + HR) in the app, include it in weekly exports, and expose Garmin tools to Claude Code via a custom MCP server.

**Architecture:** A shared `lib/garmin.ts` module wraps the `garmin-connect` npm package and exposes typed fetch functions used by two Next.js API routes (`/api/garmin/sync` for activity match, `/api/garmin/recovery` for recovery fetch + cache). A separate `mcp-garmin/index.ts` stdio MCP server reuses the same package for Claude Code tool access. Recovery data is stored in the week document's `garmin_recovery` field (Vercel Blob) and displayed in DayCards and the session logger.

**Tech Stack:** `garmin-connect` (npm, unofficial Garmin API wrapper), `@modelcontextprotocol/sdk` (MCP server), Next.js App Router API routes, Vercel Blob, Zod v4, TypeScript, Tailwind v4.

**Important notes:**
- `garmin-connect` is a CommonJS module — import as `import pkg from 'garmin-connect'; const { GarminConnect } = pkg as any`
- Credentials live in `.env.local` as `GARMIN_EMAIL` and `GARMIN_PASSWORD` (already set from MCP config)
- No automated tests — this is a personal tool (per project spec)
- The MCP server at `mcp-garmin/index.ts` is run via `npx tsx mcp-garmin/index.ts` and needs updating in `~/.claude.json`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/schema.ts` | Modify | Add `GarminRecoveryDaySchema`, `garmin_recovery` to `WeekDocSchema`, `garmin_activity_id`/`source` to `SessionSchema` |
| `lib/garmin.ts` | Create | Auth + typed fetchers (activities, sleep, HR) for app API routes |
| `app/api/garmin/sync/route.ts` | Create | Match Garmin activity to a session date |
| `app/api/garmin/recovery/route.ts` | Create | Fetch + cache recovery data for a date |
| `components/GarminRecoveryCard.tsx` | Create | Reusable recovery display + fetch button |
| `components/DayCard.tsx` | Modify | Add compact recovery strip |
| `components/WeekGrid.tsx` | Modify | Pass `garmin_recovery` through to DayCard |
| `app/page.tsx` | Modify | Pass `garmin_recovery` to WeekGrid |
| `app/log/[day]/page.tsx` | Modify | Auto-fill from Garmin on load + show recovery card |
| `mcp-garmin/index.ts` | Create | Custom stdio MCP server with 4 Garmin tools |
| `package.json` | Modify | Add `garmin-connect`, `@modelcontextprotocol/sdk`, `tsx` |
| `~/.claude.json` | Modify | Update MCP server command to use custom server |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/panosstylianides/Projects/pantrainer
npm install garmin-connect @modelcontextprotocol/sdk
npm install --save-dev tsx
```

Expected output: packages added with no peer dependency errors.

- [ ] **Step 2: Verify garmin-connect import works in the project**

```bash
node -e "const pkg = require('./node_modules/garmin-connect'); console.log(typeof pkg.GarminConnect)"
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add garmin-connect, @modelcontextprotocol/sdk, tsx dependencies"
```

---

## Task 2: Schema updates

**Files:**
- Modify: `lib/schema.ts`

- [ ] **Step 1: Add `GarminRecoveryDaySchema` and update `SessionSchema` and `WeekDocSchema`**

In `lib/schema.ts`, make these changes:

After the `HealthFlagSchema` block (around line 54), add:

```typescript
// Garmin recovery data for a single day
export const GarminRecoveryDaySchema = z.object({
  sleep_hours: z.number().nullable().optional(),
  deep_sleep_hours: z.number().nullable().optional(),
  rem_sleep_hours: z.number().nullable().optional(),
  resting_hr_bpm: z.number().nullable().optional(),
  max_hr_bpm: z.number().nullable().optional(),
  fetched_at: z.string().optional(),
})

export type GarminRecoveryDay = z.infer<typeof GarminRecoveryDaySchema>
```

In `SessionSchema` (around line 19), add two optional fields after `photos`:

```typescript
  garmin_activity_id: z.number().nullable().optional(),
  source: z.enum(['garmin', 'manual']).optional(),
```

In `WeekDocSchema` (around line 69), add `garmin_recovery` after `next_week_plan`:

```typescript
  garmin_recovery: z.record(z.string(), GarminRecoveryDaySchema).default({}),
```

Also add the type export at the bottom:

```typescript
export type GarminRecoveryDay = z.infer<typeof GarminRecoveryDaySchema>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected output: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/schema.ts
git commit -m "feat(schema): add GarminRecoveryDay, garmin_recovery to WeekDoc, source to Session"
```

---

## Task 3: `lib/garmin.ts` — shared Garmin client

**Files:**
- Create: `lib/garmin.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/garmin.ts
import pkg from 'garmin-connect'

// garmin-connect is CJS — cast to any to avoid type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GarminConnect } = pkg as any

export type GarminActivityRaw = {
  activityId: number
  activityName: string
  activityType: { typeKey: string }
  startTimeLocal: string   // "2026-04-20 09:00:00"
  duration: number         // seconds
  averageHR: number | null
  calories: number | null
}

export type GarminSleepResult = {
  sleep_hours: number
  deep_sleep_hours: number
  rem_sleep_hours: number
}

export type GarminHRResult = {
  resting_hr_bpm: number | null
  max_hr_bpm: number | null
}

async function createClient() {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('GARMIN_EMAIL and GARMIN_PASSWORD must be set')
  const client = new GarminConnect({ username: email, password })
  await client.login()
  return client
}

export async function fetchActivitiesForDate(date: string): Promise<GarminActivityRaw[]> {
  const client = await createClient()
  // Fetch last 20 activities and filter by date (YYYY-MM-DD prefix match on startTimeLocal)
  const all: GarminActivityRaw[] = await client.getActivities(0, 20)
  return all.filter((a) => a.startTimeLocal?.startsWith(date))
}

export async function fetchSleepData(date: string): Promise<GarminSleepResult | null> {
  const client = await createClient()
  const dateObj = new Date(date + 'T12:00:00')
  const raw = await client.getSleepData(dateObj)
  const dto = raw?.dailySleepDTO
  if (!dto) return null
  return {
    sleep_hours: Math.round((dto.sleepTimeSeconds / 3600) * 10) / 10,
    deep_sleep_hours: Math.round((dto.deepSleepSeconds / 3600) * 10) / 10,
    rem_sleep_hours: Math.round((dto.remSleepSeconds / 3600) * 10) / 10,
  }
}

export async function fetchHRData(date: string): Promise<GarminHRResult> {
  const client = await createClient()
  const dateObj = new Date(date + 'T12:00:00')
  const raw = await client.getHeartRate(dateObj)
  return {
    resting_hr_bpm: raw?.restingHeartRate ?? null,
    max_hr_bpm: raw?.maxHeartRate ?? null,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected output: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/garmin.ts
git commit -m "feat(garmin): add shared Garmin client with activity, sleep, HR fetchers"
```

---

## Task 4: `/api/garmin/sync` route — activity match

**Files:**
- Create: `app/api/garmin/sync/route.ts`

This route accepts `?date=YYYY-MM-DD`, fetches Garmin activities for that date, and returns the best match based on the session type.

Activity type matching logic:
- Session type `"Strength"` → Garmin typeKey matches: `strength_training`, `weight_training`, `gym_and_fitness_equipment`
- Session type `"Conditioning"` → Garmin typeKey matches: `cardio`, `hiit`, `running`, `cycling`, `swimming`, `workout`
- Session type `"Recovery"` or `"Rest"` → no match expected, return `matched: false`
- Default → longest activity by duration

- [ ] **Step 1: Create the route**

```typescript
// app/api/garmin/sync/route.ts
import { fetchActivitiesForDate } from '@/lib/garmin'

const STRENGTH_TYPES = new Set(['strength_training', 'weight_training', 'gym_and_fitness_equipment', 'fitness_equipment'])
const CONDITIONING_TYPES = new Set(['cardio', 'hiit', 'running', 'cycling', 'swimming', 'workout', 'training'])

function pickBestActivity(activities: Awaited<ReturnType<typeof fetchActivitiesForDate>>, sessionType: string) {
  if (!activities.length) return null

  let candidates = activities
  if (sessionType === 'Strength') {
    const filtered = activities.filter((a) => STRENGTH_TYPES.has(a.activityType?.typeKey))
    if (filtered.length) candidates = filtered
  } else if (sessionType === 'Conditioning') {
    const filtered = activities.filter((a) => CONDITIONING_TYPES.has(a.activityType?.typeKey))
    if (filtered.length) candidates = filtered
  }

  // Pick the longest activity
  return candidates.reduce((best, a) => (a.duration > best.duration ? a : best), candidates[0])
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const sessionType = searchParams.get('type') ?? ''

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return Response.json({ matched: false, reason: 'Garmin credentials not configured' })
  }

  try {
    const activities = await fetchActivitiesForDate(date)
    const best = pickBestActivity(activities, sessionType)

    if (!best) {
      return Response.json({ matched: false })
    }

    return Response.json({
      matched: true,
      garmin_activity_id: best.activityId,
      duration_min: best.duration ? Math.round(best.duration / 60) : null,
      avg_hr_bpm: best.averageHR ? Math.round(best.averageHR) : null,
      total_calories: best.calories ? Math.round(best.calories) : null,
      activity_name: best.activityName,
      activity_type: best.activityType?.typeKey,
    })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return Response.json({ matched: false, reason: 'Garmin fetch failed' })
  }
}
```

- [ ] **Step 2: Test the route manually**

Start the dev server (`npm run dev`) and open:
```
http://localhost:3000/api/garmin/sync?date=2026-04-20&type=Strength
```

Expected: `{ matched: true, duration_min: N, avg_hr_bpm: N, ... }` or `{ matched: false }` — no 500 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/garmin/sync/route.ts
git commit -m "feat(api): add /api/garmin/sync route for activity match by date"
```

---

## Task 5: `/api/garmin/recovery` route — recovery fetch + cache

**Files:**
- Create: `app/api/garmin/recovery/route.ts`

This route accepts `POST { date: "YYYY-MM-DD" }`, fetches sleep + HR from Garmin, writes the result into `garmin_recovery[date]` in the current week doc, and returns the recovery object. If the date already has data and `force` is not set, it returns the cached data without calling Garmin.

- [ ] **Step 1: Create the route**

```typescript
// app/api/garmin/recovery/route.ts
import { fetchSleepData, fetchHRData } from '@/lib/garmin'
import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'

export async function POST(req: Request) {
  const body = await req.json() as { date?: string; force?: boolean }
  const { date, force = false } = body

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return Response.json({ error: 'Garmin credentials not configured' }, { status: 503 })
  }

  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  // Return cached data if available and not forcing refresh
  const existing = week.garmin_recovery?.[date]
  if (existing && !force) {
    return Response.json({ recovery: existing, cached: true })
  }

  try {
    const [sleep, hr] = await Promise.allSettled([
      fetchSleepData(date),
      fetchHRData(date),
    ])

    const recovery = {
      sleep_hours: sleep.status === 'fulfilled' ? sleep.value?.sleep_hours ?? null : null,
      deep_sleep_hours: sleep.status === 'fulfilled' ? sleep.value?.deep_sleep_hours ?? null : null,
      rem_sleep_hours: sleep.status === 'fulfilled' ? sleep.value?.rem_sleep_hours ?? null : null,
      resting_hr_bpm: hr.status === 'fulfilled' ? hr.value.resting_hr_bpm : null,
      max_hr_bpm: hr.status === 'fulfilled' ? hr.value.max_hr_bpm : null,
      fetched_at: new Date().toISOString(),
    }

    // Write into week doc
    week.garmin_recovery = { ...week.garmin_recovery, [date]: recovery }
    await writeCurrentWeek(week)

    return Response.json({ recovery, cached: false })
  } catch (err) {
    console.error('Garmin recovery error:', err)
    return Response.json({ error: 'Failed to fetch recovery data from Garmin' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Test the route manually**

With dev server running, use curl or browser devtools:
```bash
curl -X POST http://localhost:3000/api/garmin/recovery \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-20"}'
```

Expected: `{ recovery: { sleep_hours: 7.8, resting_hr_bpm: 35, ... }, cached: false }`

Call again without `force: true` → Expected: same data, `cached: true`, no Garmin call.

- [ ] **Step 3: Commit**

```bash
git add app/api/garmin/recovery/route.ts
git commit -m "feat(api): add /api/garmin/recovery route with Vercel Blob caching"
```

---

## Task 6: `GarminRecoveryCard` component

**Files:**
- Create: `components/GarminRecoveryCard.tsx`

This is a client component used in two places:
- **Compact mode** (DayCard): single line — `💤 7.8h  ❤️ 35bpm` + fetch button if no data
- **Full mode** (session logger): all metrics in a card with a "↻ Refresh" button

- [ ] **Step 1: Create the component**

```typescript
// components/GarminRecoveryCard.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { GarminRecoveryDay } from '@/lib/schema'

interface GarminRecoveryCardProps {
  date: string
  recovery: GarminRecoveryDay | null | undefined
  compact?: boolean
  onFetched?: (data: GarminRecoveryDay) => void
}

export default function GarminRecoveryCard({
  date,
  recovery,
  compact = false,
  onFetched,
}: GarminRecoveryCardProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<GarminRecoveryDay | null | undefined>(recovery)

  async function fetchRecovery(force = false) {
    setLoading(true)
    try {
      const res = await fetch('/api/garmin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, force }),
      })
      if (res.ok) {
        const json = await res.json() as { recovery: GarminRecoveryDay }
        setData(json.recovery)
        onFetched?.(json.recovery)
      }
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    if (!data?.resting_hr_bpm && !data?.sleep_hours) {
      return (
        <button
          onClick={(e) => { e.preventDefault(); fetchRecovery() }}
          disabled={loading}
          className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors tracking-widest uppercase"
        >
          {loading ? 'Fetching...' : '[ Fetch recovery ]'}
        </button>
      )
    }
    return (
      <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
        {data.sleep_hours != null && (
          <span>💤 {data.sleep_hours}h</span>
        )}
        {data.resting_hr_bpm != null && (
          <span>❤️ {data.resting_hr_bpm}bpm</span>
        )}
        <button
          onClick={(e) => { e.preventDefault(); fetchRecovery(true) }}
          disabled={loading}
          className="text-zinc-700 hover:text-zinc-500 transition-colors"
          title="Refresh from Garmin"
        >
          ↻
        </button>
      </div>
    )
  }

  // Full card mode
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
          Recovery · Garmin
        </span>
        <button
          onClick={() => fetchRecovery(data != null)}
          disabled={loading}
          className={cn(
            'text-[10px] font-mono tracking-widest uppercase transition-colors',
            loading ? 'text-zinc-600' : 'text-lime-400/70 hover:text-lime-400',
          )}
        >
          {loading ? 'Fetching...' : data ? '↻ Refresh' : 'Fetch'}
        </button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.sleep_hours != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Sleep</div>
              <div className="text-sky-400 text-lg font-mono font-black leading-none">{data.sleep_hours}h</div>
              {(data.deep_sleep_hours != null || data.rem_sleep_hours != null) && (
                <div className="text-zinc-600 text-[9px] font-mono mt-0.5">
                  deep {data.deep_sleep_hours}h · REM {data.rem_sleep_hours}h
                </div>
              )}
            </div>
          )}
          {data.resting_hr_bpm != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Resting HR</div>
              <div className="text-rose-400 text-lg font-mono font-black leading-none">{data.resting_hr_bpm}</div>
              <div className="text-zinc-600 text-[9px] font-mono mt-0.5">bpm</div>
            </div>
          )}
          {data.max_hr_bpm != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Max HR</div>
              <div className="text-amber-400 text-lg font-mono font-black leading-none">{data.max_hr_bpm}</div>
              <div className="text-zinc-600 text-[9px] font-mono mt-0.5">bpm</div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-zinc-600 text-xs font-mono">
          No recovery data fetched yet. Click Fetch to pull from Garmin.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected output: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/GarminRecoveryCard.tsx
git commit -m "feat(ui): add GarminRecoveryCard component (compact + full modes)"
```

---

## Task 7: DayCard + WeekGrid — recovery strip

**Files:**
- Modify: `components/DayCard.tsx`
- Modify: `components/WeekGrid.tsx`
- Modify: `app/page.tsx`

DayCard needs to show the compact recovery strip. Since `GarminRecoveryCard` is a client component and `DayCard` is already a client component, this is straightforward. The recovery data for the day comes from the week doc's `garmin_recovery` map, passed down from the home page.

- [ ] **Step 1: Update `DayCard` to accept and display recovery data**

Add `recovery` prop and import `GarminRecoveryCard`. In `components/DayCard.tsx`:

Change the interface:
```typescript
import GarminRecoveryCard from './GarminRecoveryCard'
import type { GarminRecoveryDay } from '@/lib/schema'

interface DayCardProps {
  session: Session
  isToday: boolean
  recovery?: GarminRecoveryDay | null
}
```

Change the function signature:
```typescript
export default function DayCard({ session, isToday, recovery }: DayCardProps) {
```

Add the recovery strip just before the closing `</div>` of the outer `<div className="p-4 space-y-3">` (after the today indicator block, around line 147):

```typescript
        {/* Recovery strip */}
        <div className="pt-1 border-t border-zinc-800/40">
          <GarminRecoveryCard
            date={session.date}
            recovery={recovery}
            compact
          />
        </div>
```

- [ ] **Step 2: Update `WeekGrid` to accept and pass recovery data**

In `components/WeekGrid.tsx`, change to:

```typescript
import DayCard from './DayCard'
import type { Session, GarminRecoveryDay } from '@/lib/schema'

interface WeekGridProps {
  sessions: Session[]
  todayISO: string
  garminRecovery: Record<string, GarminRecoveryDay>
}

export default function WeekGrid({ sessions, todayISO, garminRecovery }: WeekGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
      {sessions.map((session) => (
        <DayCard
          key={session.date}
          session={session}
          isToday={session.date === todayISO}
          recovery={garminRecovery[session.date] ?? null}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update `app/page.tsx` to pass `garmin_recovery`**

Find the `<WeekGrid` usage in `app/page.tsx` and add the prop:

```typescript
<WeekGrid
  sessions={week.sessions}
  todayISO={todayISO}
  garminRecovery={week.garmin_recovery ?? {}}
/>
```

- [ ] **Step 4: Verify TypeScript compiles and app loads**

```bash
npx tsc --noEmit
```

Open `http://localhost:3000` — each day card should show a `[ Fetch recovery ]` button at the bottom. Clicking it should call the API and display sleep/HR data.

- [ ] **Step 5: Commit**

```bash
git add components/DayCard.tsx components/WeekGrid.tsx app/page.tsx
git commit -m "feat(ui): add Garmin recovery strip to DayCard"
```

---

## Task 8: Session logger — auto-fill + recovery card

**Files:**
- Modify: `app/log/[day]/page.tsx`

The session logger is a large client component (~813 lines). Changes needed:
1. On mount, call `/api/garmin/sync?date=YYYY-MM-DD&type=SessionType` to auto-fill fields
2. Show a "Synced from Garmin" badge on pre-filled fields (cleared on manual edit)
3. Show `GarminRecoveryCard` (full mode) above the log form
4. Track `garmin_activity_id` and `source` in the saved session

- [ ] **Step 1: Add Garmin sync state variables**

Find the block of `useState` declarations in `app/log/[day]/page.tsx` (around line 155). Add after the existing state:

```typescript
  const [garminSynced, setGarminSynced] = useState<{
    duration?: boolean
    avg_hr?: boolean
    calories?: boolean
    activity_id?: number
  }>({})
  const [garminRecovery, setGarminRecovery] = useState<import('@/lib/schema').GarminRecoveryDay | null>(null)
  const [garminLoading, setGarminLoading] = useState(false)
```

- [ ] **Step 2: Add Garmin fetch effect**

Find the `useEffect` that fetches the session data (around line 186, the one that calls `/api/session/${day}`). After that `useEffect`, add a new one:

```typescript
  // Auto-fill from Garmin when session loads
  useEffect(() => {
    if (!session || session.status === 'completed' || session.status === 'skipped') return

    setGarminLoading(true)

    const dateStr = session.date
    const syncUrl = `/api/garmin/sync?date=${dateStr}&type=${encodeURIComponent(session.type)}`

    Promise.allSettled([
      fetch(syncUrl).then((r) => r.json()),
      fetch('/api/garmin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr }),
      }).then((r) => r.json()),
    ]).then(([syncResult, recoveryResult]) => {
      if (syncResult.status === 'fulfilled') {
        const sync = syncResult.value as {
          matched: boolean
          duration_min?: number
          avg_hr_bpm?: number
          total_calories?: number
          garmin_activity_id?: number
        }
        if (sync.matched) {
          const synced: typeof garminSynced = { activity_id: sync.garmin_activity_id }
          if (sync.duration_min != null && !duration) {
            setDuration(String(sync.duration_min))
            synced.duration = true
          }
          if (sync.avg_hr_bpm != null && !avgHr) {
            setAvgHr(String(sync.avg_hr_bpm))
            synced.avg_hr = true
          }
          if (sync.total_calories != null && !calories) {
            setCalories(String(sync.total_calories))
            synced.calories = true
          }
          setGarminSynced(synced)
        }
      }
      if (recoveryResult.status === 'fulfilled') {
        const rec = recoveryResult.value as { recovery?: import('@/lib/schema').GarminRecoveryDay }
        if (rec.recovery) setGarminRecovery(rec.recovery)
      }
    }).finally(() => setGarminLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.date])
```

- [ ] **Step 3: Add "Synced" badge helper and clear-on-edit wrappers**

Add a small helper component near the top of the file (before the `ReadOnlyView` component):

```typescript
function GarminBadge() {
  return (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-lime-400/10 text-lime-400 border border-lime-400/20">
      Garmin
    </span>
  )
}
```

- [ ] **Step 4: Add badges and clear-on-edit to duration, avgHr, calories inputs**

Find the duration input field in the logger form. It will look something like:
```typescript
<input
  value={duration}
  onChange={(e) => setDuration(e.target.value)}
  ...
/>
```

For each of the three fields (duration, avgHr, calories), wrap the label to show the badge and update the onChange to clear the synced flag:

For the **duration** field label, add: `{garminSynced.duration && <GarminBadge />}`

For the **duration** input onChange:
```typescript
onChange={(e) => { setDuration(e.target.value); setGarminSynced((s) => ({ ...s, duration: false })) }}
```

For the **avg HR** field label, add: `{garminSynced.avg_hr && <GarminBadge />}`

For the **avg HR** input onChange:
```typescript
onChange={(e) => { setAvgHr(e.target.value); setGarminSynced((s) => ({ ...s, avg_hr: false })) }}
```

For the **calories** field label, add: `{garminSynced.calories && <GarminBadge />}`

For the **calories** input onChange:
```typescript
onChange={(e) => { setCalories(e.target.value); setGarminSynced((s) => ({ ...s, calories: false })) }}
```

- [ ] **Step 5: Add recovery card above the form**

Find where the log form starts (the `<form>` or the first input section in the `LoggerView` component). Add the recovery card just above it:

```typescript
import GarminRecoveryCard from '@/components/GarminRecoveryCard'

// Inside the form, before the first field group:
{session.status !== 'completed' && session.status !== 'skipped' && (
  <GarminRecoveryCard
    date={session.date}
    recovery={garminRecovery}
    onFetched={(data) => setGarminRecovery(data)}
  />
)}
```

- [ ] **Step 6: Pass `garmin_activity_id` and `source` when saving**

Find the `handleSave` or `handleComplete` function where the PATCH call is made. The body currently includes `{ type, subtype, duration_min, avg_hr_bpm, total_calories, notes, ... }`. Add:

```typescript
garmin_activity_id: garminSynced.activity_id ?? null,
source: Object.values(garminSynced).some(Boolean) ? 'garmin' : 'manual',
```

- [ ] **Step 7: Verify TypeScript compiles and the logger works**

```bash
npx tsc --noEmit
```

Open a session logger page (`http://localhost:3000/log/monday`). Expect:
- Recovery card shows (or has a Fetch button)
- After ~2 seconds, Garmin fields auto-fill with lime "Garmin" badges if a matching activity is found
- Editing a pre-filled field removes its badge
- Saving sends the correct payload including `garmin_activity_id` and `source`

- [ ] **Step 8: Commit**

```bash
git add app/log/[day]/page.tsx
git commit -m "feat(ui): auto-fill session logger from Garmin activities + recovery card"
```

---

## Task 9: Custom MCP server

**Files:**
- Create: `mcp-garmin/index.ts`

This is a standalone stdio MCP server. It uses the `garmin-connect` npm package directly (not `lib/garmin.ts`) because it runs locally and uses file-based token caching, not Vercel Blob. Credentials come from the same `GARMIN_EMAIL`/`GARMIN_PASSWORD` env vars.

- [ ] **Step 1: Create the MCP server**

```typescript
// mcp-garmin/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import pkg from 'garmin-connect'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { GarminConnect } = pkg as any

const TOKEN_PATH = path.join(os.homedir(), '.garmin-mcp-tokens.json')

async function createClient() {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('GARMIN_EMAIL and GARMIN_PASSWORD must be set')

  const client = new GarminConnect({ username: email, password })

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      await client.loadToken(cached.oauth1, cached.oauth2)
      return client
    } catch {
      // Token invalid — fall through to fresh login
    }
  }

  await client.login()
  const token = client.exportToken()
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), 'utf-8')
  return client
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

const server = new Server(
  { name: 'garmin-connect', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_week_activities',
      description: 'Fetch all Garmin activities for a date range (Mon–Sun of the current or specified week)',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
    {
      name: 'get_recovery_snapshot',
      description: 'Fetch sleep duration and resting HR for each date in a range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
    {
      name: 'get_daily_hr',
      description: 'Fetch resting HR and max HR for a specific date',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date YYYY-MM-DD' },
        },
        required: ['date'],
      },
    },
    {
      name: 'get_last_activity',
      description: 'Fetch the most recent Garmin activity',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    const client = await createClient()

    if (name === 'get_last_activity') {
      const activities = await client.getActivities(0, 1)
      const a = activities[0]
      if (!a) return { content: [{ type: 'text', text: 'No activities found' }] }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: a.activityName,
            type: a.activityType?.typeKey,
            date: a.startTimeLocal,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            calories: a.calories ? Math.round(a.calories) : null,
          }, null, 2),
        }],
      }
    }

    if (name === 'get_week_activities') {
      const { start_date, end_date } = args as { start_date: string; end_date: string }
      const all = await client.getActivities(0, 50)
      const filtered = all.filter((a: any) =>
        a.startTimeLocal >= start_date && a.startTimeLocal <= end_date + ' 23:59:59'
      )
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filtered.map((a: any) => ({
            date: a.startTimeLocal?.split(' ')[0],
            name: a.activityName,
            type: a.activityType?.typeKey,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            calories: a.calories ? Math.round(a.calories) : null,
          })), null, 2),
        }],
      }
    }

    if (name === 'get_daily_hr') {
      const { date } = args as { date: string }
      const raw = await client.getHeartRate(new Date(date + 'T12:00:00'))
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            date,
            resting_hr_bpm: raw?.restingHeartRate ?? null,
            max_hr_bpm: raw?.maxHeartRate ?? null,
          }, null, 2),
        }],
      }
    }

    if (name === 'get_recovery_snapshot') {
      const { start_date, end_date } = args as { start_date: string; end_date: string }

      const dates: string[] = []
      const cursor = new Date(start_date + 'T12:00:00')
      const end = new Date(end_date + 'T12:00:00')
      while (cursor <= end) {
        dates.push(formatDate(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }

      const results = await Promise.all(dates.map(async (date) => {
        const [sleepRes, hrRes] = await Promise.allSettled([
          client.getSleepData(new Date(date + 'T12:00:00')),
          client.getHeartRate(new Date(date + 'T12:00:00')),
        ])
        const dto = sleepRes.status === 'fulfilled' ? sleepRes.value?.dailySleepDTO : null
        const hr = hrRes.status === 'fulfilled' ? hrRes.value : null
        return {
          date,
          sleep_hours: dto ? Math.round((dto.sleepTimeSeconds / 3600) * 10) / 10 : null,
          deep_sleep_hours: dto ? Math.round((dto.deepSleepSeconds / 3600) * 10) / 10 : null,
          rem_sleep_hours: dto ? Math.round((dto.remSleepSeconds / 3600) * 10) / 10 : null,
          resting_hr_bpm: hr?.restingHeartRate ?? null,
        }
      }))

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Garmin MCP server running on stdio')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected output: no errors.

- [ ] **Step 3: Test the MCP server directly**

```bash
cd /Users/panosstylianides/Projects/pantrainer
GARMIN_EMAIL=panosst68@gmail.com GARMIN_PASSWORD=qweZXC123 npx tsx mcp-garmin/index.ts &
```

Then send a `tools/list` request via pipe (or let it start and kill it — just verify it starts without crashing).

Expected: `Garmin MCP server running on stdio` on stderr, no crash.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add mcp-garmin/index.ts
git commit -m "feat(mcp): add custom Garmin Connect MCP server with 4 tools"
```

---

## Task 10: Update Claude Code MCP config

**Files:**
- Modify: `~/.claude.json` — update the `garmin` MCP server entry to use the custom server

- [ ] **Step 1: Update the MCP server command**

The current config in `~/.claude.json` (under the pantrainer project) points at `@nicolasvegam/garmin-connect-mcp`. Update it to use the custom server:

```bash
claude mcp remove garmin
claude mcp add garmin \
  -e GARMIN_EMAIL=panosst68@gmail.com \
  -e GARMIN_PASSWORD=qweZXC123 \
  -- npx tsx /Users/panosstylianides/Projects/pantrainer/mcp-garmin/index.ts
```

- [ ] **Step 2: Verify the config was written**

```bash
cat ~/.claude.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
proj = d['projects']['/Users/panosstylianides/Projects/pantrainer']
print(json.dumps(proj['mcpServers']['garmin'], indent=2))
"
```

Expected: shows the updated command pointing at `mcp-garmin/index.ts`.

- [ ] **Step 3: Start a new Claude Code session and verify Garmin tools appear**

In a new Claude Code session in this project, run:
```
/mcp
```

Expected: `garmin` server listed as connected with tools: `get_week_activities`, `get_recovery_snapshot`, `get_daily_hr`, `get_last_activity`.

- [ ] **Step 4: Commit**

```bash
git add mcp-garmin/
git commit -m "docs: add mcp-garmin directory; MCP config updated to custom server"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Activity auto-fill → Tasks 4, 8
- ✅ Recovery fetch on demand + cache → Task 5
- ✅ Recovery shown in DayCard → Task 7
- ✅ Recovery shown in session logger → Task 8
- ✅ Export includes `garmin_recovery` → Task 2 (schema change means it's included automatically in existing export logic)
- ✅ MCP server with 4 tools → Task 9
- ✅ Manual override (fields editable, badge clears) → Task 8
- ✅ No fetch if cached (cache rule) → Task 5
- ✅ Graceful fallback if Garmin unavailable → Tasks 4, 5 (try/catch returns `matched: false` / error response)
- ✅ Credentials in `.env.local` → Tasks 3, 9

**Gaps noted:**
- Body battery and HRV not included — the confirmed working methods from the `garmin-connect` npm package don't expose these. Can be added later by discovering the correct `client.get(url)` endpoints. The schema `GarminRecoveryDaySchema` has no body battery fields — intentionally omitted until endpoints are confirmed.
- Token refresh: the app does a fresh login on every API call. Acceptable for a personal tool with low call frequency (~2 calls per day). If login latency becomes a problem, Vercel Blob token caching can be added to `lib/garmin.ts`.
