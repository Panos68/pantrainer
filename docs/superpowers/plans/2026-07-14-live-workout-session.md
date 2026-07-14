# Live Workout Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional full-screen, one-exercise-at-a-time "Live Session" logging flow with per-set effort capture and an automatic rest timer (including correct superset round handling), without changing the existing table/photo-import logging path.

**Architecture:** A new pure logic module (`lib/liveSession.ts`) builds a flat, ordered "queue" of steps (sets to log + rests to run) from a session's `exercises`/`exercise_groups`, handling straight sets and superset rounds identically well. A new client page (`app/log/[day]/live/page.tsx`) drives that queue full-screen, persisting each logged set immediately via the existing `PATCH /api/session/[day]` endpoint (a shallow merge, so sending the full updated `exercises` array is sufficient — no new API route needed). The existing table page (`app/log/[day]/page.tsx`) gets one new "Start Live Session" link and a small change to derive displayed aggregates from `sets` when present.

**Tech Stack:** Next.js App Router (client components), TypeScript, Zod (`lib/schema.ts`). No test framework (vitest/jest) is installed in this repo — pure-logic tests use plain `node:assert` scripts run via the existing `tsx` devDependency, and UI pieces (RestTimer, live page) are verified manually rather than adding a new test-framework dependency.

## Global Constraints

- Photo/AI-import path and its data fields (`actual_sets`, `actual_reps`, `actual_weight_kg`, `effort`, `actual_note`) must not change behavior.
- No persistent "logging mode" preference — live session is opt-in per visit via a button, not a setting.
- New `sets` field on `ExerciseSchema` is optional; all existing sessions (without it) must continue to work unchanged.
- Effort per set defaults to `'perfect'`.
- Per-exercise note stays singular (`actual_note`), not per-set.
- Superset rest durations: `rest_between_exercises_sec` between exercises within a round, `rest_between_sets_sec` after a round's last exercise.
- All work happens on branch `feature/live-workout-session` (already checked out).

---

## Task 1: Schema — add per-set data field

**Files:**
- Modify: `lib/schema.ts:7-25` (`ExerciseSchema`)
- Test: `lib/schema.test.ts` (new file, run via `tsx`)

**Interfaces:**
- Produces: `ExerciseSchema` gains `sets: z.array(SetEntrySchema).optional()` where `SetEntrySchema = { reps: number, weight_kg: number | null, effort: 'easy'|'perfect'|'hard', completed_at: string }`. Exported as `SetEntrySchema` and type `SetEntry` for later tasks to import.

- [ ] **Step 1: Write the failing test**

```ts
// lib/schema.test.ts
import assert from 'node:assert/strict'
import { ExerciseSchema } from './schema'

function run() {
  {
    const result = ExerciseSchema.safeParse({
      name: 'Back Squat',
      alternatives: [],
      sets: [
        { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: '2026-07-14T10:00:00.000Z' },
        { reps: 8, weight_kg: 60, effort: 'hard', completed_at: '2026-07-14T10:05:00.000Z' },
      ],
    })
    assert.equal(result.success, true, 'accepts an exercise with a populated sets array')
  }
  {
    const result = ExerciseSchema.safeParse({ name: 'Bench Press', alternatives: [] })
    assert.equal(result.success, true, 'accepts an exercise with no sets field (backward compatibility)')
  }
  {
    const result = ExerciseSchema.safeParse({
      name: 'Back Squat',
      alternatives: [],
      sets: [{ reps: 8, weight_kg: 60, effort: 'medium', completed_at: '2026-07-14T10:00:00.000Z' }],
    })
    assert.equal(result.success, false, 'rejects a set entry with an invalid effort value')
  }
  console.log('lib/schema.test.ts: all assertions passed')
}

run()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/schema.test.ts`
Expected: FAIL — throws an `AssertionError` on the third assertion, since `sets` isn't a recognized key yet so zod strips it and the effort value is never validated (or an earlier error if `sets` in the parse input causes a different failure). Either way it must not print "all assertions passed" yet.

- [ ] **Step 3: Add the schema field**

In `lib/schema.ts`, above `ExerciseSchema` (before line 7), add:

```ts
export const SetEntrySchema = z.object({
  reps: z.number(),
  weight_kg: z.number().nullable(),
  effort: z.enum(['easy', 'perfect', 'hard']),
  completed_at: z.string(),
})
```

Inside `ExerciseSchema` (after `actual_note: z.string().nullable().optional(),` on line 17), add:

```ts
  sets: z.array(SetEntrySchema).optional(),
```

Near the bottom export type block (after line 231, `export type Exercise = z.infer<typeof ExerciseSchema>`), add:

```ts
export type SetEntry = z.infer<typeof SetEntrySchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/schema.test.ts`
Expected: prints "lib/schema.test.ts: all assertions passed", exit code 0

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts lib/schema.test.ts
git commit -m "feat(schema): add optional per-set sets field to ExerciseSchema"
```

---

## Task 2: Live session traversal + derivation engine

**Files:**
- Create: `lib/liveSession.ts`
- Test: `lib/liveSession.test.ts` (new file, run via `tsx`)

**Interfaces:**
- Consumes: `Session`, `Exercise`, `ExerciseGroup`, `SetEntry` types from `lib/schema.ts` (Task 1).
- Produces (for Task 3/4 to import):
  - `type LiveStep = { kind: 'set'; groupId: string | null; exerciseIndex: number; exercise: Exercise; setNumber: number; totalSets: number; roundNumber: number | null; totalRounds: number | null } | { kind: 'rest'; seconds: number }`
  - `function buildLiveQueue(session: Session): LiveStep[]`
  - `function deriveAggregates(sets: SetEntry[]): { actual_sets: number; actual_reps: number; actual_weight_kg: number | null; effort: 'easy' | 'perfect' | 'hard' }`

- [ ] **Step 1: Write the failing test — straight exercise traversal, superset rounds, aggregate derivation**

```ts
// lib/liveSession.test.ts
import assert from 'node:assert/strict'
import { buildLiveQueue, deriveAggregates } from './liveSession'
import type { Session } from './schema'

function baseSession(overrides: Partial<Session>): Session {
  return {
    date: '2026-07-14',
    day: 'Monday',
    type: 'Strength',
    exercises: [],
    status: 'planned',
    photos: [],
    muscle_groups: [],
    ...overrides,
  } as Session
}

function testStraightSets() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Main',
        type: 'straight',
        rest_between_sets_sec: 90,
        exercises: [{ name: 'Back Squat', sets: 3, reps: 8, weight_kg: 60, alternatives: [] }],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const kinds = queue.map((s) => s.kind)
  assert.deepEqual(kinds, ['set', 'rest', 'set', 'rest', 'set'], 'straight: set/rest pattern, no trailing rest')
  const rest = queue[1]
  assert.equal(rest.kind === 'rest' && rest.seconds, 90, 'straight: uses rest_between_sets_sec')
}

function testSupersetRounds() {
  const session = baseSession({
    exercise_groups: [
      {
        group_id: 'g1',
        label: 'Superset A',
        type: 'superset',
        rest_between_sets_sec: 90,
        rest_between_exercises_sec: 15,
        exercises: [
          { name: 'DB Row', sets: 2, reps: 10, weight_kg: 20, alternatives: [] },
          { name: 'Push Up', sets: 2, reps: 12, weight_kg: null, alternatives: [] },
        ],
      },
    ],
  })
  const queue = buildLiveQueue(session)
  const summary = queue.map((s) => (s.kind === 'set' ? `set:${s.exercise.name}` : `rest:${s.seconds}`))
  assert.deepEqual(summary, [
    'set:DB Row', 'rest:15', 'set:Push Up', 'rest:90',
    'set:DB Row', 'rest:15', 'set:Push Up',
  ], 'superset: alternates within round, correct rest durations, no trailing rest')
}

function testDeriveAggregates() {
  const result = deriveAggregates([
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 7, weight_kg: 60, effort: 'hard', completed_at: 't2' },
  ])
  assert.deepEqual(result, { actual_sets: 2, actual_reps: 7, actual_weight_kg: 60, effort: 'hard' })

  const effortOnly = deriveAggregates([
    { reps: 8, weight_kg: 60, effort: 'perfect', completed_at: 't1' },
    { reps: 8, weight_kg: 60, effort: 'easy', completed_at: 't2' },
  ])
  assert.equal(effortOnly.effort, 'easy', 'prefers easy over perfect')
}

testStraightSets()
testSupersetRounds()
testDeriveAggregates()
console.log('lib/liveSession.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/liveSession.test.ts`
Expected: FAIL — "Cannot find module './liveSession'"

- [ ] **Step 3: Implement `lib/liveSession.ts`**

```ts
import type { Exercise, ExerciseGroup, Session, SetEntry } from './schema'

export type LiveStep =
  | {
      kind: 'set'
      groupId: string | null
      exerciseIndex: number
      exercise: Exercise
      setNumber: number
      totalSets: number
      roundNumber: number | null
      totalRounds: number | null
    }
  | { kind: 'rest'; seconds: number }

const DEFAULT_REST_SEC = 60

function plannedSetCount(ex: Exercise): number {
  return ex.sets ?? 1
}

function buildStraightSteps(group: ExerciseGroup, exerciseIndex: number, ex: Exercise): LiveStep[] {
  const total = plannedSetCount(ex)
  const steps: LiveStep[] = []
  for (let i = 0; i < total; i++) {
    steps.push({
      kind: 'set',
      groupId: group.group_id,
      exerciseIndex,
      exercise: ex,
      setNumber: i + 1,
      totalSets: total,
      roundNumber: null,
      totalRounds: null,
    })
    if (i < total - 1) {
      steps.push({ kind: 'rest', seconds: group.rest_between_sets_sec ?? DEFAULT_REST_SEC })
    }
  }
  return steps
}

function buildSupersetSteps(group: ExerciseGroup, exerciseIndexOffset: number): LiveStep[] {
  const rounds = Math.max(...group.exercises.map(plannedSetCount), 1)
  const steps: LiveStep[] = []
  for (let round = 0; round < rounds; round++) {
    group.exercises.forEach((ex, i) => {
      steps.push({
        kind: 'set',
        groupId: group.group_id,
        exerciseIndex: exerciseIndexOffset + i,
        exercise: ex,
        setNumber: round + 1,
        totalSets: rounds,
        roundNumber: round + 1,
        totalRounds: rounds,
      })
      const isLastExerciseInRound = i === group.exercises.length - 1
      if (!isLastExerciseInRound) {
        steps.push({ kind: 'rest', seconds: group.rest_between_exercises_sec ?? DEFAULT_REST_SEC })
      } else if (round < rounds - 1) {
        steps.push({ kind: 'rest', seconds: group.rest_between_sets_sec ?? DEFAULT_REST_SEC })
      }
    })
  }
  return steps
}

export function buildLiveQueue(session: Session): LiveStep[] {
  const groups = session.exercise_groups
  if (!groups || groups.length === 0) {
    let exerciseIndex = 0
    const steps: LiveStep[] = []
    for (const ex of session.exercises) {
      const total = plannedSetCount(ex)
      for (let i = 0; i < total; i++) {
        steps.push({
          kind: 'set',
          groupId: null,
          exerciseIndex,
          exercise: ex,
          setNumber: i + 1,
          totalSets: total,
          roundNumber: null,
          totalRounds: null,
        })
        if (i < total - 1) steps.push({ kind: 'rest', seconds: DEFAULT_REST_SEC })
      }
      exerciseIndex++
    }
    return steps
  }

  const steps: LiveStep[] = []
  let exerciseIndex = 0
  for (const group of groups) {
    if (group.type === 'superset') {
      steps.push(...buildSupersetSteps(group, exerciseIndex))
      exerciseIndex += group.exercises.length
    } else {
      for (const ex of group.exercises) {
        steps.push(...buildStraightSteps(group, exerciseIndex, ex))
        exerciseIndex++
      }
    }
  }
  return steps
}

const EFFORT_RANK: Record<SetEntry['effort'], number> = { perfect: 0, easy: 1, hard: 2 }

export function deriveAggregates(sets: SetEntry[]): {
  actual_sets: number
  actual_reps: number
  actual_weight_kg: number | null
  effort: SetEntry['effort']
} {
  const last = sets[sets.length - 1]
  const worst = sets.reduce((acc, s) => (EFFORT_RANK[s.effort] > EFFORT_RANK[acc] ? s.effort : acc), 'perfect' as SetEntry['effort'])
  return {
    actual_sets: sets.length,
    actual_reps: last.reps,
    actual_weight_kg: last.weight_kg,
    effort: worst,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/liveSession.test.ts`
Expected: prints "lib/liveSession.test.ts: all assertions passed", exit code 0

- [ ] **Step 5: Commit**

```bash
git add lib/liveSession.ts lib/liveSession.test.ts
git commit -m "feat(live-session): add queue-building and aggregate-derivation logic"
```

---

## Task 3: Table view derives aggregates from `sets` when present

**Files:**
- Modify: `app/log/[day]/page.tsx` (near `planToActualPreset`, lines 246-268, and wherever `exerciseActuals` is initialized from `session.exercises` on load)
- Test: manual verification (see Step 3) — this file has no existing unit test harness for the page component; do not introduce a new one for a single derived-value read, per YAGNI.

**Interfaces:**
- Consumes: `deriveAggregates` from `lib/liveSession.ts` (Task 2).

- [ ] **Step 1: Locate the session-load effect**

Find the `useEffect` in `app/log/[day]/page.tsx` that runs on session fetch and calls `setExerciseActuals(session.exercises.map(...))` (this initializes `exerciseActuals` from `session.exercises[i].actual_sets` etc.). This is the single place aggregates are read into UI state.

- [ ] **Step 2: Prefer derived aggregates when `sets` is present**

At the top of `app/log/[day]/page.tsx`, add the import:

```ts
import { deriveAggregates } from '@/lib/liveSession'
```

In the mapping function that builds each `ExerciseActual` from `ex: Session['exercises'][number]`, change the aggregate reads so that when `ex.sets && ex.sets.length > 0`, the derived values take precedence over the stored `actual_*` fields, e.g.:

```ts
function actualsFromExercise(ex: Session['exercises'][number]): ExerciseActual {
  if (ex.sets && ex.sets.length > 0) {
    const derived = deriveAggregates(ex.sets)
    return {
      sets: derived.actual_sets.toString(),
      reps: derived.actual_reps.toString(),
      weight_kg: derived.actual_weight_kg?.toString() ?? '',
      effort: derived.effort,
      note: ex.actual_note ?? '',
    }
  }
  return {
    sets: ex.actual_sets?.toString() ?? '',
    reps: ex.actual_reps?.toString() ?? '',
    weight_kg: ex.actual_weight_kg?.toString() ?? '',
    effort: ex.effort ?? null,
    note: ex.actual_note ?? '',
  }
}
```

Replace the inline mapping in the load effect with a call to `actualsFromExercise(ex)`.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open a session's log page for a day whose plan includes an exercise, and confirm the table renders identically to before (since no exercise has `sets` populated yet, this is a no-op path change). This will be re-verified end-to-end once Task 5 can populate `sets`.

- [ ] **Step 4: Commit**

```bash
git add app/log/\[day\]/page.tsx
git commit -m "feat(log-page): derive table aggregates from per-set data when present"
```

---

## Task 4: Rest timer component

**Files:**
- Create: `components/RestTimer.tsx`

**Interfaces:**
- Produces: `<RestTimer seconds={number} onDone={() => void} onSkip={() => void} onAddSeconds={(delta: number) => void} />` — a self-contained countdown display with skip and +30s controls, calling `onDone` when it reaches zero.

No `@testing-library/react`/jsdom is installed in this repo, and adding one is out of scope for a single UI component — verify this component manually via Task 5's live-page walkthrough (which renders it directly) rather than introducing a new test-framework dependency.

- [ ] **Step 1: Implement `components/RestTimer.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RestTimer({
  seconds,
  onDone,
  onSkip,
  onAddSeconds,
}: {
  seconds: number
  onDone: () => void
  onSkip: () => void
  onAddSeconds: (delta: number) => void
}) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) {
      onDone()
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [remaining, onDone])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-6xl font-mono tabular-nums">{formatMmSs(remaining)}</div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => { setRemaining((r) => r + 30); onAddSeconds(30) }}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          +30s
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Skip rest
        </button>
      </div>
    </div>
  )
}
```

`onAddSeconds` is kept purely as a notification hook for the parent (the component manages its own `remaining` state locally); the `+30s` button updates local state directly and also invokes it.

- [ ] **Step 2: Commit**

```bash
git add components/RestTimer.tsx
git commit -m "feat(live-session): add RestTimer component"
```

---

## Task 5: Live session page — set logging, persistence, swap, note step

**Files:**
- Create: `app/log/[day]/live/page.tsx`
- Modify: `app/log/[day]/page.tsx` (add "Start Live Session" link)

**Interfaces:**
- Consumes: `buildLiveQueue`, `LiveStep`, `deriveAggregates` from `lib/liveSession.ts` (Task 2); `RestTimer` from `components/RestTimer.tsx` (Task 4); `Session`, `SetEntry` types from `lib/schema.ts` (Task 1); existing `GET`/`PATCH /api/session/[day]` endpoints (unchanged).
- Produces: route `/log/[day]/live`.

- [ ] **Step 1: Add the entry point link in the table page**

In `app/log/[day]/page.tsx`, near the top of the page's header/actions area (locate the existing action buttons, e.g. near the save button), add:

```tsx
import Link from 'next/link'
// ...
<Link
  href={`/log/${day}/live`}
  className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-mono"
>
  Start Live Session
</Link>
```

(`day` here is the same `params.day as string` value already used elsewhere on this page.)

- [ ] **Step 2: Implement the live session page**

```tsx
// app/log/[day]/live/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import RestTimer from '@/components/RestTimer'
import { buildLiveQueue, deriveAggregates, type LiveStep } from '@/lib/liveSession'
import type { Session, SetEntry } from '@/lib/schema'

export default function LiveSessionPage() {
  const params = useParams()
  const day = (params.day as string) ?? ''
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [loggedSets, setLoggedSets] = useState<Record<number, SetEntry[]>>({}) // exerciseIndex -> sets
  const [stepIndex, setStepIndex] = useState(0)
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!day) return
    fetch(`/api/session/${day}`)
      .then((r) => r.json())
      .then((data: Session) => {
        setSession(data)
        const initial: Record<number, SetEntry[]> = {}
        data.exercises.forEach((ex, i) => {
          if (ex.sets && ex.sets.length > 0) initial[i] = ex.sets
        })
        setLoggedSets(initial)
      })
  }, [day])

  const queue = useMemo<LiveStep[]>(() => (session ? buildLiveQueue(session) : []), [session])
  const step = queue[stepIndex] ?? null

  // Resume at the first not-yet-logged set for its exercise.
  useEffect(() => {
    if (!session || queue.length === 0) return
    const firstIncomplete = queue.findIndex(
      (s) => s.kind === 'set' && (loggedSets[s.exerciseIndex]?.length ?? 0) < s.setNumber,
    )
    if (firstIncomplete !== -1) setStepIndex(firstIncomplete)
  }, [session, queue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step?.kind === 'set') {
      setReps(step.exercise.reps != null ? String(step.exercise.reps) : '')
      setWeight(step.exercise.weight_kg != null ? String(step.exercise.weight_kg) : '')
    }
  }, [step])

  async function persist(exerciseIndex: number, sets: SetEntry[]) {
    if (!session) return
    setSaving(true)
    const nextExercises = session.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, sets } : ex,
    )
    const updated = { ...session, exercises: nextExercises }
    setSession(updated)
    await fetch(`/api/session/${day}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises: nextExercises }),
    })
    setSaving(false)
  }

  function logCurrentSet(effort: SetEntry['effort']) {
    if (!step || step.kind !== 'set') return
    const entry: SetEntry = {
      reps: Number(reps) || 0,
      weight_kg: weight ? Number(weight) : null,
      effort,
      completed_at: new Date().toISOString(),
    }
    const nextSets = [...(loggedSets[step.exerciseIndex] ?? []), entry]
    setLoggedSets((prev) => ({ ...prev, [step.exerciseIndex]: nextSets }))
    persist(step.exerciseIndex, nextSets)
    setStepIndex((i) => i + 1)
  }

  if (!session) return <div className="p-6 text-zinc-400">Loading…</div>
  if (!step) {
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <div className="text-lime-400 font-mono">Session complete.</div>
        <button
          type="button"
          onClick={() => router.push(`/log/${day}`)}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Back to log
        </button>
      </div>
    )
  }

  if (step.kind === 'rest') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black">
        <RestTimer
          seconds={step.seconds}
          onDone={() => setStepIndex((i) => i + 1)}
          onSkip={() => setStepIndex((i) => i + 1)}
          onAddSeconds={() => {}}
        />
      </div>
    )
  }

  const roundLabel =
    step.roundNumber != null ? `Round ${step.roundNumber} of ${step.totalRounds}` : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-zinc-100 p-6">
      {roundLabel && <div className="text-xs text-zinc-500 font-mono">{roundLabel}</div>}
      <div className="text-2xl font-mono">{step.exercise.name}</div>
      <div className="text-sm text-zinc-500 font-mono">
        Set {step.setNumber} of {step.totalSets}
      </div>
      <div className="flex gap-3">
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          className="w-20 px-3 py-2 rounded bg-zinc-900 text-center font-mono"
        />
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="w-20 px-3 py-2 rounded bg-zinc-900 text-center font-mono"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => logCurrentSet('easy')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Easy
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => logCurrentSet('perfect')}
          className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-semibold"
        >
          Perfect
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => logCurrentSet('hard')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Hard
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open `/log/<today's day>`, click "Start Live Session", and walk through:
1. A straight exercise: log each set, confirm the rest timer auto-advances between sets and the last set has no trailing rest.
2. A superset group (if the current week's plan has one; otherwise temporarily edit a test week JSON to include an `exercise_groups` entry with `type: 'superset'` and two exercises to verify locally): confirm exercises alternate within a round and the round-end rest uses `rest_between_sets_sec`.
3. Return to `/log/<day>` afterward and confirm the table shows the derived aggregates (from Task 3) for exercises logged live.
4. Refresh mid-session and confirm it resumes at the first incomplete set (via the `loggedSets`-from-`session.exercises[i].sets` hydration and the resume `useEffect`).

- [ ] **Step 4: Commit**

```bash
git add app/log/\[day\]/live/page.tsx app/log/\[day\]/page.tsx
git commit -m "feat(live-session): add full-screen live logging page with rest timer"
```

---

## Task 6: Alternative-exercise swap in the live view

**Files:**
- Modify: `app/log/[day]/live/page.tsx` (Task 5's file)

**Interfaces:**
- Consumes: `Session['exercises'][number].alternatives` (existing field, unchanged).

- [ ] **Step 1: Add swap state and control**

In `app/log/[day]/live/page.tsx`, add state:

```ts
const [swappedExercise, setSwappedExercise] = useState<Record<number, number>>({})
```

Derive the exercise actually shown/logged for the current step by substituting from `swappedExercise`:

```ts
const activeExercise =
  step?.kind === 'set'
    ? (() => {
        const altIndex = swappedExercise[step.exerciseIndex]
        if (altIndex == null) return step.exercise
        const alt = step.exercise.alternatives[altIndex]
        return { ...step.exercise, name: alt.name, sets: alt.sets ?? step.exercise.sets, reps: alt.reps ?? step.exercise.reps, weight_kg: alt.weight_kg ?? step.exercise.weight_kg }
      })()
    : null
```

Replace `step.exercise.name` in the JSX (Task 5, set-view branch) with `activeExercise?.name`, and the reps/weight prefill effect to read from `activeExercise` instead of `step.exercise`. Only render the swap control (and only allow changing `swappedExercise`) when `(loggedSets[step.exerciseIndex]?.length ?? 0) === 0` — i.e., before the first set of that exercise/round has been logged, matching the spec's rule that a swap decision locks in once logging starts.

Add the control just above the reps/weight inputs, shown only when `step.exercise.alternatives.length > 0`:

```tsx
{step.kind === 'set' && step.exercise.alternatives.length > 0 && (loggedSets[step.exerciseIndex]?.length ?? 0) === 0 && (
  <select
    value={swappedExercise[step.exerciseIndex] ?? -1}
    onChange={(e) => {
      const v = Number(e.target.value)
      setSwappedExercise((prev) => {
        const next = { ...prev }
        if (v === -1) delete next[step.exerciseIndex]
        else next[step.exerciseIndex] = v
        return next
      })
    }}
    className="px-3 py-2 rounded bg-zinc-900 text-zinc-200 text-sm font-mono"
  >
    <option value={-1}>{step.exercise.name}</option>
    {step.exercise.alternatives.map((alt, ai) => (
      <option key={ai} value={ai}>{alt.name}</option>
    ))}
  </select>
)}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, open a live session for an exercise that has `alternatives` populated, confirm: the dropdown appears before the first set, selecting an alternative changes the displayed name and reps/weight prefill, and the dropdown disappears once the first set of that exercise is logged.

- [ ] **Step 3: Commit**

```bash
git add app/log/\[day\]/live/page.tsx
git commit -m "feat(live-session): support alternative-exercise swap in live view"
```

---

## Task 7: End-to-end verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx tsx lib/schema.test.ts && npx tsx lib/liveSession.test.ts`
Expected: both print their "all assertions passed" line, exit code 0

- [ ] **Step 2: Full manual walkthrough**

Repeat Task 5 Step 3 and Task 6 Step 2 end-to-end in one pass on a real (or test) week's data, covering: straight exercise, superset group, swap, exit-and-resume, and confirming the table view (Task 3) reflects everything correctly afterward with no regression to photo-import fields.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feature/live-workout-session
gh pr create --title "feat: live workout session with per-set rest timer" --body "$(cat <<'EOF'
## Summary
- Full-screen live logging flow: one exercise/set at a time, with an automatic rest timer including correct superset round handling
- Per-set effort capture (default Perfect) feeds the same progression logic via derived aggregates
- Alternative-exercise swap available in the live view
- Existing table view and photo/AI-import logging path unchanged

## Test plan
- [ ] `npx tsx lib/schema.test.ts && npx tsx lib/liveSession.test.ts` passes
- [ ] Manual: log a straight exercise live, confirm rest timer and table reflect it
- [ ] Manual: log a superset group live, confirm round ordering and rest durations
- [ ] Manual: swap to an alternative before logging, confirm it locks after first set
- [ ] Manual: exit mid-session and resume, confirm correct resume point
EOF
)"
```

---

## Deferred (separate follow-up, not part of this plan)

Improving exercise demo gif/video reliability (`components/ExerciseDemo.tsx`, `app/api/exercise-demo/route.ts`) is out of scope here — it requires research into alternative exercise-media data sources and is tracked as a separate future project per the design spec's non-goals.
