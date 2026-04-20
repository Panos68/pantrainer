# Hosting Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate PanTrainer from local-only desktop app to Vercel-hosted web app with Vercel Blob storage, remove Notion integration, and add structured exercise logging with planned vs actual tracking.

**Architecture:** Replace `fs`-based data layer in `lib/data.ts` with `@vercel/blob` async reads/writes. All data functions become async, propagating `await` through API routes and server components. Session logger gains a structured exercise table for Strength sessions.

**Tech Stack:** Next.js 16 (App Router), Vercel Blob (`@vercel/blob`), Zod, Tailwind CSS, deployed to Vercel free tier.

---

## File Map

**Delete:**
- `lib/notion.ts`
- `app/api/notion/push/route.ts`
- `app/api/notion/pull/route.ts`
- `components/NotionSync.tsx`

**Create:**
- `lib/progression.ts` — `nameToKey()` + `updateLiftProgression()`

**Modify:**
- `package.json` — remove `@notionhq/client`, add `@vercel/blob`
- `lib/schema.ts` — remove `notionLastSync` from AppState; add `actual_sets`, `actual_reps`, `actual_weight_kg` to Exercise
- `lib/data.ts` — full rewrite: all functions async, using Vercel Blob SDK
- `lib/export.ts` — make `buildExport` async (awaits data calls)
- `lib/import.ts` — make `applyImport` async (awaits data calls)
- `app/api/session/[day]/route.ts` — await data calls; update lift_progression on complete
- `app/api/week/route.ts` — await data calls
- `app/api/state/route.ts` — await data calls
- `app/api/history/route.ts` — await data calls
- `app/api/export/route.ts` — await data calls; remove `fs` disk write
- `app/api/import/route.ts` — await `applyImport`
- `app/api/setup/route.ts` — await data calls; remove dead `fs` write
- `app/page.tsx` — make async; await data calls; remove NotionSync
- `app/progress/page.tsx` — make async; await data calls
- `app/log/[day]/page.tsx` — add exercise actuals state + structured table UI
- `components/WeekGrid.tsx` — remove `notionConfigured` prop
- `components/DayCard.tsx` — remove `notionConfigured` prop

---

## Task 1: Remove Notion, Install Vercel Blob

**Files:**
- Modify: `package.json`
- Delete: `lib/notion.ts`, `app/api/notion/push/route.ts`, `app/api/notion/pull/route.ts`, `components/NotionSync.tsx`

- [ ] **Step 1: Install @vercel/blob and uninstall @notionhq/client**

```bash
npm install @vercel/blob
npm uninstall @notionhq/client
```

Expected: `package.json` no longer has `@notionhq/client`; `@vercel/blob` appears in dependencies.

- [ ] **Step 2: Delete Notion files**

```bash
rm lib/notion.ts
rm -rf app/api/notion
rm components/NotionSync.tsx
```

- [ ] **Step 3: Verify build still compiles (ignoring TS errors from callers — will fix in later tasks)**

```bash
npm run build 2>&1 | head -40
```

Expected: Errors only about missing imports of the deleted files — not compiler crashes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Notion integration, install @vercel/blob"
```

---

## Task 2: Update Schema

**Files:**
- Modify: `lib/schema.ts`

- [ ] **Step 1: Add actual exercise fields to ExerciseSchema**

In `lib/schema.ts`, replace the ExerciseSchema definition (lines 7–13) with:

```typescript
export const ExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().nullable().optional(),
  reps: z.union([z.number(), z.string()]).nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  actual_sets: z.number().nullable().optional(),
  actual_reps: z.union([z.number(), z.string()]).nullable().optional(),
  actual_weight_kg: z.number().nullable().optional(),
})
```

- [ ] **Step 2: Remove `notionLastSync` from AppStateSchema**

Replace the AppStateSchema definition with:

```typescript
export const AppStateSchema = z.object({
  gymWeek: z.enum(['week_a', 'week_b', 'legs_week']).default('week_a'),
  deloadCounter: z.number().default(1),
  lastDeloadWeek: z.string().nullable().default(null),
  isDeloadWeek: z.boolean().default(false),
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -30
```

Expected: Only errors about callers of data.ts (still using sync signatures) — not schema errors.

- [ ] **Step 4: Commit**

```bash
git add lib/schema.ts
git commit -m "feat: add actual exercise fields to schema, remove notionLastSync"
```

---

## Task 3: Rewrite lib/data.ts with Vercel Blob

**Files:**
- Modify: `lib/data.ts`

- [ ] **Step 1: Replace lib/data.ts entirely**

```typescript
import { put, head, del, list } from '@vercel/blob'
import { WeekDocSchema, AthleteProfileSchema, AppStateSchema } from './schema'
import type { WeekDoc, AthleteProfile, AppState } from './schema'
import { format, parseISO } from 'date-fns'

const CURRENT_WEEK_KEY = 'data/current-week.json'
const ATHLETE_KEY = 'data/athlete.json'
const STATE_KEY = 'data/state.json'
const WEEKS_PREFIX = 'data/weeks/'

async function readBlobAsJson<T>(pathname: string): Promise<T | null> {
  try {
    const blob = await head(pathname)
    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

async function writeBlobAsJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

async function deleteBlobIfExists(pathname: string): Promise<void> {
  try {
    const blob = await head(pathname)
    await del(blob.url)
  } catch {
    // blob not found, ignore
  }
}

export async function readCurrentWeek(): Promise<WeekDoc | null> {
  const raw = await readBlobAsJson<unknown>(CURRENT_WEEK_KEY)
  if (!raw) return null
  return WeekDocSchema.parse(raw)
}

export async function writeCurrentWeek(week: WeekDoc): Promise<void> {
  await writeBlobAsJson(CURRENT_WEEK_KEY, week)
}

export async function readAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await readBlobAsJson<unknown>(ATHLETE_KEY)
  if (!raw) return null
  return AthleteProfileSchema.parse(raw)
}

export async function writeAthleteProfile(profile: AthleteProfile): Promise<void> {
  await writeBlobAsJson(ATHLETE_KEY, profile)
}

export async function readAppState(): Promise<AppState> {
  const raw = await readBlobAsJson<unknown>(STATE_KEY)
  if (!raw) {
    const defaults = AppStateSchema.parse({})
    await writeBlobAsJson(STATE_KEY, defaults)
    return defaults
  }
  return AppStateSchema.parse(raw)
}

export async function writeAppState(state: AppState): Promise<void> {
  await writeBlobAsJson(STATE_KEY, state)
}

function getWeekFilename(week: WeekDoc): string {
  if (week.sessions && week.sessions.length > 0) {
    const firstDate = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date
    return `week-${format(parseISO(firstDate), 'yyyy-ww')}.json`
  }
  return `week-${format(new Date(), 'yyyy-ww')}.json`
}

export async function archiveWeek(week: WeekDoc): Promise<void> {
  const filename = getWeekFilename(week)
  await writeBlobAsJson(`${WEEKS_PREFIX}${filename}`, week)
  await deleteBlobIfExists(CURRENT_WEEK_KEY)
}

export async function readArchivedWeeks(n: number): Promise<WeekDoc[]> {
  const result = await list({ prefix: WEEKS_PREFIX })
  const sorted = result.blobs
    .sort((a, b) => b.pathname.localeCompare(a.pathname))
    .slice(0, n)
  const weeks = await Promise.all(
    sorted.map(async (blob) => {
      const res = await fetch(blob.url, { cache: 'no-store' })
      return WeekDocSchema.parse(await res.json())
    })
  )
  return weeks.reverse()
}

export async function readAllArchivedWeeks(): Promise<WeekDoc[]> {
  const result = await list({ prefix: WEEKS_PREFIX })
  const sorted = result.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname))
  return Promise.all(
    sorted.map(async (blob) => {
      const res = await fetch(blob.url, { cache: 'no-store' })
      return WeekDocSchema.parse(await res.json())
    })
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles (errors expected in callers — that's fine)**

```bash
npx tsc --noEmit 2>&1 | grep "lib/data" | head -10
```

Expected: No errors inside `lib/data.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/data.ts
git commit -m "feat: rewrite data layer to use Vercel Blob (async)"
```

---

## Task 4: Create lib/progression.ts

**Files:**
- Create: `lib/progression.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { Exercise, LiftProgression } from './schema'

export function nameToKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[\s\-\/]+/g, '_')
      .replace(/[^a-z0-9_]/g, '') + '_kg'
  )
}

export function updateLiftProgression(
  exercises: Exercise[],
  current: LiftProgression,
): LiftProgression {
  const updated = { ...current }
  for (const ex of exercises) {
    if (ex.actual_weight_kg != null) {
      const key = nameToKey(ex.name)
      updated[key] = ex.actual_weight_kg
    }
  }
  return updated
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/progression" | head -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/progression.ts
git commit -m "feat: add lift progression auto-update from actual exercise weights"
```

---

## Task 5: Make lib/export.ts and lib/import.ts Async

**Files:**
- Modify: `lib/export.ts`
- Modify: `lib/import.ts`

- [ ] **Step 1: Update lib/export.ts — make buildExport async**

Replace `lib/export.ts` entirely:

```typescript
import type { WeekDoc } from './schema'
import { readArchivedWeeks, readAppState } from './data'

export interface ExportPayload {
  week: string
  athlete: WeekDoc['athlete']
  sessions: WeekDoc['sessions']
  week_summary: WeekDoc['week_summary']
  lift_progression: WeekDoc['lift_progression']
  health_flags: WeekDoc['health_flags']
  next_week_plan: WeekDoc['next_week_plan']
  is_deload_week: boolean
  photos_to_attach: string[]
  history: WeekHistory[]
}

export interface WeekHistory {
  week: string
  total_sessions: number
  strength_days: number
  conditioning_days: number
  total_calories: number
  peak_lifts: Record<string, number>
}

export async function buildExport(currentWeek: WeekDoc): Promise<ExportPayload> {
  const state = await readAppState()

  const photos_to_attach = currentWeek.sessions
    .flatMap((s) => s.photos ?? [])
    .filter(Boolean)

  const archivedWeeks = await readArchivedWeeks(4)
  const history: WeekHistory[] = archivedWeeks.map((w) => ({
    week: w.week,
    total_sessions: w.week_summary.total_sessions,
    strength_days: w.week_summary.strength_days,
    conditioning_days: w.week_summary.high_output_days,
    total_calories: w.week_summary.total_calories,
    peak_lifts: Object.fromEntries(
      Object.entries(w.lift_progression)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => [k, v as number])
    ),
  }))

  return {
    ...currentWeek,
    is_deload_week: state.isDeloadWeek,
    photos_to_attach,
    history,
  }
}
```

- [ ] **Step 2: Update lib/import.ts — make applyImport async**

Replace only the `applyImport` function (keep `validateImport` as-is). Replace from line 55 to end of file:

```typescript
export async function applyImport(importedDoc: WeekDoc): Promise<WeekDoc> {
  const currentWeek = await readCurrentWeek()

  const preservedByDay: Record<string, WeekDoc['sessions'][number]> = {}
  if (currentWeek) {
    for (const s of currentWeek.sessions) {
      if (s.status === 'completed' || s.status === 'skipped') {
        preservedByDay[s.day] = s
      }
    }
  }

  const importedByDay: Record<string, WeekDoc['sessions'][number]> = {}
  for (const s of importedDoc.sessions) {
    importedByDay[s.day] = s
  }

  const firstSession = importedDoc.sessions.find((s) => s.date)
  let mondayDate: Date | null = null
  if (firstSession) {
    const d = new Date(firstSession.date + 'T12:00:00')
    const dayIndex = ALL_DAYS.indexOf(firstSession.day)
    if (dayIndex >= 0) {
      mondayDate = new Date(d)
      mondayDate.setDate(d.getDate() - dayIndex)
    }
  }

  const mergedSessions = ALL_DAYS.map((dayName, i) => {
    if (preservedByDay[dayName]) return preservedByDay[dayName]
    if (importedByDay[dayName]) return importedByDay[dayName]
    const date = mondayDate
      ? new Date(mondayDate.getTime() + i * 86400000).toISOString().slice(0, 10)
      : ''
    return {
      date,
      day: dayName,
      type: 'Rest',
      subtype: null,
      exercises: [],
      status: 'planned' as const,
      duration_min: null,
      avg_hr_bpm: null,
      total_calories: null,
      notes: '',
      photos: [],
    }
  })

  const merged: WeekDoc = {
    ...importedDoc,
    sessions: mergedSessions,
  }

  await writeCurrentWeek(merged)
  return merged
}
```

Also update the import at the top of `lib/import.ts` to include `writeCurrentWeek`:
```typescript
import { readCurrentWeek, writeCurrentWeek } from './data'
```

- [ ] **Step 3: Commit**

```bash
git add lib/export.ts lib/import.ts
git commit -m "feat: make export and import functions async for Vercel Blob"
```

---

## Task 6: Update API Routes

**Files:**
- Modify: `app/api/session/[day]/route.ts`
- Modify: `app/api/week/route.ts`
- Modify: `app/api/state/route.ts`
- Modify: `app/api/history/route.ts`
- Modify: `app/api/export/route.ts`
- Modify: `app/api/import/route.ts`
- Modify: `app/api/setup/route.ts`

- [ ] **Step 1: Update app/api/session/[day]/route.ts**

Replace the file entirely:

```typescript
import { readCurrentWeek, writeCurrentWeek } from '@/lib/data'
import { updateLiftProgression } from '@/lib/progression'
import type { Session, WeekSummary } from '@/lib/schema'

function recalculateWeekSummary(sessions: Session[]): WeekSummary {
  const completed = sessions.filter((s) => s.status === 'completed')
  return {
    total_sessions: completed.length,
    high_output_days: completed.filter((s) => s.type === 'Conditioning').length,
    strength_days: completed.filter((s) => s.type === 'Strength').length,
    recovery_days: completed.filter((s) => s.type === 'Recovery' || s.type === 'Rest').length,
    total_calories: completed.reduce((sum, s) => sum + (s.total_calories ?? 0), 0),
    notes: '',
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }
  const session = week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase())
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }
  return Response.json(session)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ day: string }> },
) {
  const { day } = await params
  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 404 })
  }

  const sessionIndex = week.sessions.findIndex(
    (s) => s.day.toLowerCase() === day.toLowerCase(),
  )
  if (sessionIndex === -1) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  const session = week.sessions[sessionIndex]
  if (session.status === 'completed' || session.status === 'skipped') {
    return Response.json(
      { error: 'Session is already finalized and cannot be updated' },
      { status: 409 },
    )
  }

  const body = await req.json() as Partial<Session>
  const updatedSession: Session = { ...session, ...body }
  week.sessions[sessionIndex] = updatedSession

  if (body.status === 'completed') {
    week.week_summary = recalculateWeekSummary(week.sessions)
    if (updatedSession.type === 'Strength' && updatedSession.exercises.length > 0) {
      week.lift_progression = updateLiftProgression(
        updatedSession.exercises,
        week.lift_progression,
      )
    }
  }

  await writeCurrentWeek(week)
  return Response.json(updatedSession)
}
```

- [ ] **Step 2: Update app/api/week/route.ts**

```typescript
import { readCurrentWeek } from '@/lib/data'

export async function GET() {
  const week = await readCurrentWeek()
  if (!week) {
    return Response.json({ empty: true })
  }
  return Response.json(week)
}
```

- [ ] **Step 3: Update app/api/state/route.ts**

```typescript
import { readAppState, writeAppState } from '@/lib/data'
import { AppStateSchema } from '@/lib/schema'
import type { AppState } from '@/lib/schema'

export async function GET() {
  const state = await readAppState()
  return Response.json(state)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const state = await readAppState()
  const updates = body as Partial<AppState>
  const merged = { ...state, ...updates }
  const validated = AppStateSchema.parse(merged)
  await writeAppState(validated)
  return Response.json(validated)
}
```

- [ ] **Step 4: Update app/api/history/route.ts**

```typescript
import { readAllArchivedWeeks, readCurrentWeek } from '@/lib/data'

export async function GET() {
  const [archived, current] = await Promise.all([
    readAllArchivedWeeks(),
    readCurrentWeek(),
  ])
  const weeks = current ? [...archived, current] : archived
  return Response.json(weeks)
}
```

- [ ] **Step 5: Update app/api/export/route.ts — remove fs writes, use Vercel Blob**

```typescript
import { format, parseISO } from 'date-fns'
import { readCurrentWeek } from '@/lib/data'
import { buildExport } from '@/lib/export'

export async function POST() {
  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const payload = await buildExport(currentWeek)

  let filename: string
  if (currentWeek.sessions && currentWeek.sessions.length > 0) {
    const sorted = [...currentWeek.sessions].sort((a, b) => a.date.localeCompare(b.date))
    filename = `week-${format(parseISO(sorted[0].date), 'yyyy-ww')}.json`
  } else {
    filename = `week-${format(new Date(), 'yyyy-ww')}.json`
  }

  const json = JSON.stringify(payload, null, 2)
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

- [ ] **Step 6: Update app/api/import/route.ts — await applyImport**

```typescript
import { validateImport, applyImport } from '@/lib/import'

export async function POST(request: Request) {
  let body: { json?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, raw: '', errors: ['Invalid request body'] }, { status: 400 })
  }

  if (!body.json || typeof body.json !== 'string') {
    return Response.json({ ok: false, raw: '', errors: ['Missing or invalid "json" field'] }, { status: 400 })
  }

  const result = validateImport(body.json)
  if (!result.ok) {
    return Response.json(result, { status: 422 })
  }

  const applied = await applyImport(result.data)
  return Response.json({ ...result, data: applied })
}
```

- [ ] **Step 7: Update app/api/setup/route.ts — remove fs, await data calls**

```typescript
import { readAthleteProfile, writeAthleteProfile } from '@/lib/data'
import { AthleteProfileSchema } from '@/lib/schema'

export async function GET() {
  const profile = await readAthleteProfile()
  return Response.json({ complete: profile !== null })
}

export async function POST(request: Request) {
  const body = await request.json()
  const profile = AthleteProfileSchema.parse(body)
  await writeAthleteProfile(profile)
  return Response.json({ success: true })
}
```

- [ ] **Step 8: Commit**

```bash
git add app/api/
git commit -m "feat: update all API routes to await async data functions"
```

---

## Task 7: Update Server Components

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/progress/page.tsx`
- Modify: `components/WeekGrid.tsx`
- Modify: `components/DayCard.tsx`

- [ ] **Step 1: Remove notionConfigured prop from WeekGrid**

Replace `components/WeekGrid.tsx` entirely:

```typescript
import DayCard from './DayCard'
import type { Session } from '@/lib/schema'

interface WeekGridProps {
  sessions: Session[]
  todayISO: string
}

export default function WeekGrid({ sessions, todayISO }: WeekGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
      {sessions.map((session) => (
        <DayCard
          key={session.date}
          session={session}
          isToday={session.date === todayISO}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Remove notionConfigured prop from DayCard**

In `components/DayCard.tsx`, remove `notionConfigured?: boolean` from the `DayCardProps` interface and remove any usage of it in the component body.

- [ ] **Step 3: Update app/page.tsx — make async, await data, remove NotionSync**

Replace `app/page.tsx` entirely:

```typescript
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { readAthleteProfile, readCurrentWeek, readAppState } from '@/lib/data'
import GymWeekBadge from '@/components/GymWeekBadge'
import NewWeekButton from '@/components/NewWeekButton'
import DeloadBanner from '@/components/DeloadBanner'
import HealthFlagsBanner from '@/components/HealthFlagsBanner'
import WeekGrid from '@/components/WeekGrid'

export default async function Home() {
  const profile = await readAthleteProfile()
  if (!profile) redirect('/setup')

  const [week, appState] = await Promise.all([readCurrentWeek(), readAppState()])
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  if (!week) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">
            PanTrainer
          </p>
          <h1 className="text-5xl font-black tracking-tight uppercase leading-none">
            No Active<br />Week
          </h1>
          <p className="text-zinc-500 text-sm">
            No training week is loaded. Start a new week to begin tracking.
          </p>
          <div>
            <NewWeekButton
              label="START YOUR WEEK"
              className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
            />
          </div>
        </div>
      </main>
    )
  }

  const hasActiveFlags = week.health_flags.some((f) => !f.cleared)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase leading-none text-zinc-50">
              {profile.name}
            </h1>
          </div>
          <div className="flex flex-col sm:items-end gap-1.5">
            <span className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
              {week.week}
            </span>
            <GymWeekBadge gymWeek={appState.gymWeek} />
          </div>
        </header>

        <div className="space-y-3">
          <DeloadBanner counter={appState.deloadCounter} />
          {hasActiveFlags && <HealthFlagsBanner flags={week.health_flags} />}
        </div>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
              This Week
            </h2>
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs font-mono">
              {week.sessions.filter((s) => s.status === 'completed').length}
              /{week.sessions.length} DONE
            </span>
          </div>
          <WeekGrid sessions={week.sessions} todayISO={todayISO} />
        </section>

        <footer className="flex flex-col gap-3 pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-4">
            <a
              href="/export"
              className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Export Week
            </a>
            <a
              href="/progress"
              className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Progress
            </a>
            <NewWeekButton className="px-6 h-9 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-zinc-50 font-bold text-xs tracking-[0.15em] uppercase rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all disabled:opacity-50" />
          </div>
        </footer>

      </div>
    </main>
  )
}
```

- [ ] **Step 4: Update app/progress/page.tsx — make async, await data**

Replace the top of `app/progress/page.tsx` (the synchronous calls at the top):

```typescript
import { readAllArchivedWeeks, readCurrentWeek } from '@/lib/data'
import LiftProgressChart from '@/components/LiftProgressChart'
import ConditioningChart from '@/components/ConditioningChart'
import type { WeekDoc } from '@/lib/schema'

export default async function ProgressPage() {
  const [archived, current] = await Promise.all([
    readAllArchivedWeeks(),
    readCurrentWeek(),
  ])
  const weeks: WeekDoc[] = current ? [...archived, current] : archived
```

Keep the rest of the component unchanged.

- [ ] **Step 5: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -30
```

Expected: Only errors in `app/log/[day]/page.tsx` (exercise table not yet updated) — nothing else.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/progress/page.tsx components/WeekGrid.tsx components/DayCard.tsx
git commit -m "feat: update server components to async, remove NotionSync"
```

---

## Task 8: Structured Exercise Logger

**Files:**
- Modify: `app/log/[day]/page.tsx`

- [ ] **Step 1: Add exerciseActuals state and type**

In `app/log/[day]/page.tsx`, after the existing state declarations (around line 143), add:

```typescript
type ExerciseActual = { sets: string; reps: string; weight_kg: string }
const [exerciseActuals, setExerciseActuals] = useState<ExerciseActual[]>([])
```

- [ ] **Step 2: Initialize exerciseActuals in the load useEffect**

In the `load` useEffect, after `setSession(sessionData)` and before `setType(sessionData.type)`, add:

```typescript
setExerciseActuals(
  (sessionData.exercises ?? []).map((ex) => ({
    sets: ex.actual_sets?.toString() ?? ex.sets?.toString() ?? '',
    reps:
      ex.actual_reps?.toString() ??
      (typeof ex.reps === 'number' ? ex.reps.toString() : ex.reps ?? ''),
    weight_kg:
      ex.actual_weight_kg != null
        ? ex.actual_weight_kg.toString()
        : ex.weight_kg != null
        ? ex.weight_kg.toString()
        : '',
  }))
)
```

Also remove the block that pre-fills `notes` with exercise text (lines ~174–183):

```typescript
// Remove this block — exercises now have their own inputs:
// if (!existingNotes && sessionData.exercises && sessionData.exercises.length > 0) {
//   const lines = sessionData.exercises.map(...)
//   setNotes(lines.join('\n'))
// } else {
setNotes(sessionData.notes ?? '')
// }
```

- [ ] **Step 3: Update buildPayload to include exercises**

Replace the `buildPayload` useCallback:

```typescript
const buildPayload = useCallback(() => {
  const exercises =
    type === 'Strength'
      ? (session?.exercises ?? []).map((ex, i) => {
          const actual = exerciseActuals[i]
          return {
            ...ex,
            actual_sets: actual?.sets !== '' ? Number(actual?.sets) : undefined,
            actual_reps:
              actual?.reps !== ''
                ? isNaN(Number(actual?.reps))
                  ? actual?.reps
                  : Number(actual?.reps)
                : undefined,
            actual_weight_kg:
              actual?.weight_kg !== '' ? Number(actual?.weight_kg) : undefined,
          }
        })
      : session?.exercises ?? []

  return {
    type,
    subtype: subtype || null,
    duration_min: duration ? Number(duration) : null,
    avg_hr_bpm: avgHr ? Number(avgHr) : null,
    total_calories: calories ? Number(calories) : null,
    notes,
    photos,
    exercises,
  }
}, [type, subtype, duration, avgHr, calories, notes, photos, exerciseActuals, session])
```

- [ ] **Step 4: Replace planned exercises display with interactive table**

In the JSX, find the "Planned exercises" section (around line 379) and replace the entire block with:

```tsx
{type === 'Strength' && session.exercises && session.exercises.length > 0 && (
  <div className="space-y-2">
    <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
      Exercises — Planned → Actual
    </p>
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_repeat(6,minmax(0,3rem))] bg-zinc-900 border-b border-zinc-800">
        <div className="px-3 py-2 text-zinc-600 text-[10px] font-mono uppercase tracking-widest">Exercise</div>
        <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">S</div>
        <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">R</div>
        <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">kg</div>
        <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">S</div>
        <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">R</div>
        <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">kg</div>
      </div>
      {session.exercises.map((ex, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_repeat(6,minmax(0,3rem))] border-b border-zinc-800/60 last:border-0"
        >
          <div className="bg-zinc-950 px-3 py-2.5 text-zinc-300 text-xs font-mono font-bold truncate">
            {ex.name}
            {ex.notes && (
              <span className="block text-zinc-600 text-[10px] font-normal mt-0.5 truncate">{ex.notes}</span>
            )}
          </div>
          {/* Planned */}
          <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">{ex.sets ?? '—'}</div>
          <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">{ex.reps ?? '—'}</div>
          <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">
            {ex.weight_kg != null ? ex.weight_kg : '—'}
          </div>
          {/* Actual inputs */}
          <input
            type="number"
            inputMode="numeric"
            value={exerciseActuals[i]?.sets ?? ''}
            onChange={(e) =>
              setExerciseActuals((prev) =>
                prev.map((a, j) => (j === i ? { ...a, sets: e.target.value } : a))
              )
            }
            className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
            placeholder="—"
          />
          <input
            type="text"
            inputMode="decimal"
            value={exerciseActuals[i]?.reps ?? ''}
            onChange={(e) =>
              setExerciseActuals((prev) =>
                prev.map((a, j) => (j === i ? { ...a, reps: e.target.value } : a))
              )
            }
            className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
            placeholder="—"
          />
          <input
            type="number"
            inputMode="decimal"
            value={exerciseActuals[i]?.weight_kg ?? ''}
            onChange={(e) =>
              setExerciseActuals((prev) =>
                prev.map((a, j) => (j === i ? { ...a, weight_kg: e.target.value } : a))
              )
            }
            className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
            placeholder="—"
          />
        </div>
      ))}
    </div>
    <p className="text-zinc-600 text-[10px] font-mono">
      Violet columns = actual. Pre-filled from plan. Edit what changed.
    </p>
  </div>
)}

{type !== 'Strength' && session.exercises && session.exercises.length > 0 && (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
    <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-2">
      Planned
    </p>
    <ul className="space-y-1.5">
      {session.exercises.map((ex, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm font-mono">
          <span className="text-zinc-300 font-bold">{ex.name}</span>
          {ex.sets != null && ex.reps != null && (
            <span className="text-zinc-500">{ex.sets}×{ex.reps}</span>
          )}
          {ex.weight_kg != null && (
            <span className="text-violet-400">@ {ex.weight_kg}kg</span>
          )}
          {ex.notes && <span className="text-zinc-600 text-xs">— {ex.notes}</span>}
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 5: Update ReadOnlyView to show actuals**

In the `ReadOnlyView` function, find where it renders exercises (the `photos` block around line 100 is nearby). Add an exercises block AFTER the `session.notes` block and BEFORE the `session.photos` block:

```tsx
{session.exercises && session.exercises.length > 0 && (
  <div className="pt-3 border-t border-zinc-800">
    <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Exercises</div>
    <ul className="space-y-1.5">
      {session.exercises.map((ex, i) => (
        <li key={i} className="text-xs font-mono space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-zinc-300 font-bold">{ex.name}</span>
            <span className="text-zinc-600">
              planned: {ex.sets}×{ex.reps}
              {ex.weight_kg != null ? ` @ ${ex.weight_kg}kg` : ''}
            </span>
          </div>
          {ex.actual_weight_kg != null && (
            <div className="text-violet-400 pl-2">
              actual: {ex.actual_sets ?? ex.sets}×{ex.actual_reps ?? ex.reps} @ {ex.actual_weight_kg}kg
            </div>
          )}
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add app/log/
git commit -m "feat: structured exercise logging with planned vs actual tracking"
```

---

## Task 9: Vercel Deploy + Data Migration

**Files:**
- Create: `scripts/migrate-to-blob.ts` (one-off migration script)

- [ ] **Step 1: Add BLOB_READ_WRITE_TOKEN to .env.local for local testing**

Add to `.env.local`:
```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_<your_token_here>
```

Get the token from: Vercel dashboard → Storage → Create Blob Store → copy the token.

- [ ] **Step 2: Create one-off migration script**

Create `scripts/migrate-to-blob.ts`:

```typescript
// Run once: npx ts-node -e "require('./scripts/migrate-to-blob.ts')"
// Uploads existing data/ JSON files to Vercel Blob

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
    if (!fs.existsSync(local)) { console.log(`SKIP (missing): ${local}`); continue }
    const content = fs.readFileSync(local, 'utf-8')
    await put(blob, content, { access: 'public', addRandomSuffix: false, contentType: 'application/json' })
    console.log(`✓ Uploaded: ${blob}`)
  }

  if (fs.existsSync(weeksDir)) {
    const weekFiles = fs.readdirSync(weeksDir).filter((f) => f.endsWith('.json'))
    for (const f of weekFiles) {
      const content = fs.readFileSync(path.join(weeksDir, f), 'utf-8')
      await put(`data/weeks/${f}`, content, { access: 'public', addRandomSuffix: false, contentType: 'application/json' })
      console.log(`✓ Uploaded: data/weeks/${f}`)
    }
  }

  console.log('Migration complete.')
}

migrate().catch(console.error)
```

- [ ] **Step 3: Run migration (requires BLOB_READ_WRITE_TOKEN in .env.local)**

```bash
npx dotenvx run -- npx tsx scripts/migrate-to-blob.ts
```

Expected: Each file printed with `✓ Uploaded:`.

- [ ] **Step 4: Test locally against Blob**

```bash
npm run dev
```

Open http://localhost:3000 — verify week loads, session logging works.

- [ ] **Step 5: Push to GitHub and deploy to Vercel**

```bash
git add -A
git commit -m "chore: add Vercel deploy setup and data migration script"
git push
```

Then in Vercel dashboard:
1. Import the GitHub repo
2. Add environment variable: `BLOB_READ_WRITE_TOKEN` (from Blob store settings)
3. Deploy

- [ ] **Step 6: Verify deployed app**

Open `https://pantrainer.vercel.app` (or your Vercel URL) on phone:
- Home page loads with week grid
- Tap a session → logger opens with exercise table
- Fill in actuals, tap Save Progress → no error
- Tap Mark Complete → redirects home, session shows COMPLETED

---

## Self-Review Notes

**Spec coverage check:**
- R1 (single source of truth): ✓ Vercel Blob, single `current-week.json`
- R2 (gym alternation): ✓ unchanged, AppState still has gymWeek
- R3/R4 (new week pre-population): ✓ unchanged in import logic
- R5 (health flags carry-forward): ✓ unchanged in import logic
- R6/R7/R8 (deload counter): ✓ unchanged, AppState still has deloadCounter/isDeloadWeek
- R9/R10/R11 (session logging pre-fill): ✓ Task 8 — exercises pre-fill actuals from planned
- R12 (photos): ✓ photo field unchanged, user attaches from camera roll to Claude
- R13/R14/R15 (skip/partial/week summary): ✓ unchanged in session route
- R16/R17/R18/R19 (Notion): ✓ removed as designed
- R20/R21/R22/R23 (export): ✓ Task 6 Step 5 — export route updated, returns download
- R24/R25/R26/R27 (import): ✓ Task 5 Step 6 — import route updated
- R28/R29/R30 (progress charts): ✓ progress page updated to async
- R31 (offline for core features): ✓ session logging works without Notion
- R32 (free): ✓ Vercel free tier + Vercel Blob free tier

**Structured exercise logging (new spec):**
- Planned vs actual table: ✓ Task 8
- Auto-update lift_progression on complete: ✓ Task 6 Step 1 + Task 4
- ReadOnlyView shows actuals: ✓ Task 8 Step 5
