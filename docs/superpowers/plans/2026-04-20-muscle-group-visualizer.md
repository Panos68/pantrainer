# Muscle Group Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a front/back SVG body diagram on the session logger page highlighting the muscle groups for that session.

**Architecture:** Add `muscle_groups: string[]` to the session schema. Claude populates it when generating plans. A new `MuscleMap` component renders an inline SVG silhouette with active muscles highlighted. The component is placed between Coach Notes and the Recovery card on the logger page.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, inline SVG (no external library)

---

## File Structure

- **Create:** `components/MuscleMap.tsx` — SVG front+back body diagram, highlights muscles by name
- **Modify:** `lib/schema.ts` — add `muscle_groups` field to `SessionSchema`
- **Modify:** `app/log/[day]/page.tsx` — import and render `MuscleMap` between Coach Notes and Recovery card

---

### Task 1: Add `muscle_groups` to schema

**Files:**
- Modify: `lib/schema.ts:19-42`

- [ ] **Step 1: Add the field to SessionSchema**

In `lib/schema.ts`, add after the `hr_zones` field:

```typescript
  muscle_groups: z.array(z.string()).default([]),
```

The full supported values are: `chest`, `shoulders`, `triceps`, `biceps`, `forearms`, `back`, `lats`, `traps`, `core`, `glutes`, `quads`, `hamstrings`, `calves`, `full_body`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/schema.ts
git commit -m "feat: add muscle_groups field to SessionSchema"
```

---

### Task 2: Build the MuscleMap SVG component

**Files:**
- Create: `components/MuscleMap.tsx`

This is the core task. The component renders a front and back body silhouette as inline SVG. Each muscle region is a `<path>` with an id. Active muscles (those in the `muscles` prop) are filled with a highlight color; inactive ones are filled with zinc-800.

The SVG paths below are simplified anatomical silhouettes designed for a ~120×240 viewBox per side (front and back shown side by side at total 260×240).

- [ ] **Step 1: Create `components/MuscleMap.tsx`**

```tsx
'use client'

const HIGHLIGHT = '#a3e635'      // lime-400
const INACTIVE = '#27272a'       // zinc-800
const BODY_OUTLINE = '#3f3f46'   // zinc-700

type MuscleId =
  | 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'forearms'
  | 'back' | 'lats' | 'traps' | 'core' | 'glutes'
  | 'quads' | 'hamstrings' | 'calves' | 'full_body'

interface MuscleMapProps {
  muscles: string[]
}

// Maps muscle IDs to the path IDs they highlight (front/back)
const MUSCLE_PATHS: Record<MuscleId, string[]> = {
  chest:      ['front-chest'],
  shoulders:  ['front-shoulder-l', 'front-shoulder-r', 'back-shoulder-l', 'back-shoulder-r'],
  triceps:    ['back-tricep-l', 'back-tricep-r'],
  biceps:     ['front-bicep-l', 'front-bicep-r'],
  forearms:   ['front-forearm-l', 'front-forearm-r', 'back-forearm-l', 'back-forearm-r'],
  back:       ['back-upper', 'back-lower'],
  lats:       ['back-lat-l', 'back-lat-r'],
  traps:      ['back-trap-l', 'back-trap-r'],
  core:       ['front-core'],
  glutes:     ['back-glute-l', 'back-glute-r'],
  quads:      ['front-quad-l', 'front-quad-r'],
  hamstrings: ['back-ham-l', 'back-ham-r'],
  calves:     ['front-calf-l', 'front-calf-r', 'back-calf-l', 'back-calf-r'],
  full_body:  [
    'front-chest', 'front-shoulder-l', 'front-shoulder-r',
    'front-bicep-l', 'front-bicep-r', 'front-core',
    'front-quad-l', 'front-quad-r', 'front-calf-l', 'front-calf-r',
    'back-upper', 'back-lower', 'back-lat-l', 'back-lat-r',
    'back-trap-l', 'back-trap-r', 'back-glute-l', 'back-glute-r',
    'back-ham-l', 'back-ham-r', 'back-calf-l', 'back-calf-r',
    'back-shoulder-l', 'back-shoulder-r', 'back-tricep-l', 'back-tricep-r',
  ],
}

export default function MuscleMap({ muscles }: MuscleMapProps) {
  if (!muscles.length) return null

  const activeIds = new Set(
    muscles.flatMap((m) => MUSCLE_PATHS[m as MuscleId] ?? [])
  )

  function fill(id: string) {
    return activeIds.has(id) ? HIGHLIGHT : INACTIVE
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-3">
        Muscles Targeted
      </p>
      <div className="flex justify-center gap-6">
        {/* Front */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-zinc-600 text-[9px] font-mono tracking-widest uppercase">Front</span>
          <svg viewBox="0 0 120 240" width="90" height="180" xmlns="http://www.w3.org/2000/svg">
            {/* Body outline */}
            <ellipse cx="60" cy="22" rx="18" ry="20" fill={INACTIVE} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Neck */}
            <rect x="54" y="40" width="12" height="10" rx="3" fill={INACTIVE} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Shoulders */}
            <ellipse id="front-shoulder-l" cx="34" cy="58" rx="13" ry="10" fill={fill('front-shoulder-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <ellipse id="front-shoulder-r" cx="86" cy="58" rx="13" ry="10" fill={fill('front-shoulder-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Chest */}
            <path id="front-chest" d="M44 52 Q60 65 76 52 L78 78 Q60 88 42 78 Z" fill={fill('front-chest')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Core / abs */}
            <rect id="front-core" x="46" y="80" width="28" height="36" rx="4" fill={fill('front-core')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Biceps */}
            <path id="front-bicep-l" d="M22 62 Q16 75 20 90 L28 90 Q32 75 30 62 Z" fill={fill('front-bicep-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="front-bicep-r" d="M98 62 Q104 75 100 90 L92 90 Q88 75 90 62 Z" fill={fill('front-bicep-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Forearms */}
            <path id="front-forearm-l" d="M20 92 Q14 108 18 122 L26 122 Q30 108 28 92 Z" fill={fill('front-forearm-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="front-forearm-r" d="M100 92 Q106 108 102 122 L94 122 Q90 108 92 92 Z" fill={fill('front-forearm-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Quads */}
            <path id="front-quad-l" d="M44 118 Q38 145 40 168 L54 168 Q56 145 52 118 Z" fill={fill('front-quad-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="front-quad-r" d="M76 118 Q82 145 80 168 L66 168 Q64 145 68 118 Z" fill={fill('front-quad-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Calves front */}
            <path id="front-calf-l" d="M40 170 Q36 190 38 210 L52 210 Q54 190 54 170 Z" fill={fill('front-calf-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="front-calf-r" d="M80 170 Q84 190 82 210 L68 210 Q66 190 66 170 Z" fill={fill('front-calf-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Hip / pelvis connector */}
            <rect x="44" y="116" width="32" height="8" rx="2" fill={INACTIVE} stroke={BODY_OUTLINE} strokeWidth="1" />
          </svg>
        </div>

        {/* Back */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-zinc-600 text-[9px] font-mono tracking-widest uppercase">Back</span>
          <svg viewBox="0 0 120 240" width="90" height="180" xmlns="http://www.w3.org/2000/svg">
            {/* Head */}
            <ellipse cx="60" cy="22" rx="18" ry="20" fill={INACTIVE} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Neck */}
            <rect x="54" y="40" width="12" height="10" rx="3" fill={INACTIVE} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Traps */}
            <path id="back-trap-l" d="M44 48 Q52 52 54 62 L44 65 Q36 58 38 50 Z" fill={fill('back-trap-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-trap-r" d="M76 48 Q68 52 66 62 L76 65 Q84 58 82 50 Z" fill={fill('back-trap-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Shoulders back */}
            <ellipse id="back-shoulder-l" cx="34" cy="58" rx="13" ry="10" fill={fill('back-shoulder-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <ellipse id="back-shoulder-r" cx="86" cy="58" rx="13" ry="10" fill={fill('back-shoulder-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Upper back */}
            <path id="back-upper" d="M44 62 L76 62 L78 90 L42 90 Z" fill={fill('back-upper')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Lats */}
            <path id="back-lat-l" d="M42 65 Q34 80 36 98 L44 98 L44 65 Z" fill={fill('back-lat-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-lat-r" d="M78 65 Q86 80 84 98 L76 98 L76 65 Z" fill={fill('back-lat-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Lower back */}
            <path id="back-lower" d="M44 90 L76 90 L76 116 L44 116 Z" fill={fill('back-lower')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Triceps */}
            <path id="back-tricep-l" d="M22 62 Q16 75 20 90 L28 90 Q32 75 30 62 Z" fill={fill('back-tricep-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-tricep-r" d="M98 62 Q104 75 100 90 L92 90 Q88 75 90 62 Z" fill={fill('back-tricep-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Forearms back */}
            <path id="back-forearm-l" d="M20 92 Q14 108 18 122 L26 122 Q30 108 28 92 Z" fill={fill('back-forearm-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-forearm-r" d="M100 92 Q106 108 102 122 L94 122 Q90 108 92 92 Z" fill={fill('back-forearm-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Glutes */}
            <path id="back-glute-l" d="M44 116 Q40 130 42 140 L58 140 L58 116 Z" fill={fill('back-glute-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-glute-r" d="M76 116 Q80 130 78 140 L62 140 L62 116 Z" fill={fill('back-glute-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Hamstrings */}
            <path id="back-ham-l" d="M42 142 Q38 160 40 172 L54 172 Q56 160 58 142 Z" fill={fill('back-ham-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-ham-r" d="M78 142 Q82 160 80 172 L66 172 Q64 160 62 142 Z" fill={fill('back-ham-r')} stroke={BODY_OUTLINE} strokeWidth="1" />

            {/* Calves back */}
            <path id="back-calf-l" d="M40 174 Q36 192 38 210 L52 210 Q54 192 54 174 Z" fill={fill('back-calf-l')} stroke={BODY_OUTLINE} strokeWidth="1" />
            <path id="back-calf-r" d="M80 174 Q84 192 82 210 L68 210 Q66 192 66 174 Z" fill={fill('back-calf-r')} stroke={BODY_OUTLINE} strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* Muscle labels */}
      <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
        {muscles.map((m) => (
          <span
            key={m}
            className="px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-lime-400/10 text-lime-400 border border-lime-400/20"
          >
            {m.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/MuscleMap.tsx
git commit -m "feat: add MuscleMap SVG component with front/back body diagram"
```

---

### Task 3: Wire MuscleMap into the session logger page

**Files:**
- Modify: `app/log/[day]/page.tsx`

- [ ] **Step 1: Import MuscleMap**

Add to the imports at the top of `app/log/[day]/page.tsx`:

```tsx
import MuscleMap from '@/components/MuscleMap'
```

- [ ] **Step 2: Render MuscleMap between Coach Notes and Recovery card**

Find the Coach Notes block (around line 510) and the Recovery card (around line 632). Insert the MuscleMap between them:

```tsx
        {/* Muscle map */}
        <MuscleMap muscles={session.muscle_groups ?? []} />
```

The full block in context looks like:

```tsx
        {/* Coach guidance banner */}
        {session.subtype && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-1.5">
              Coach Notes
            </p>
            <p className="text-zinc-300 text-sm font-mono leading-relaxed">
              {session.subtype}
            </p>
          </div>
        )}

        {/* Muscle map */}
        <MuscleMap muscles={session.muscle_groups ?? []} />

        {/* Exercise table ... */}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Test locally**

```bash
npm run dev
```

Open a session that has `muscle_groups` set. The diagram should appear between Coach Notes and the exercise table. Sessions without `muscle_groups` should show nothing (empty array → component returns null).

To test without waiting for a new Claude-generated plan, temporarily hardcode `muscles={['chest', 'shoulders', 'triceps']}` in the render to verify the diagram looks right, then revert.

- [ ] **Step 5: Commit**

```bash
git add app/log/\[day\]/page.tsx
git commit -m "feat: render MuscleMap on session logger page"
```

---

### Task 4: Update Claude prompt instructions

**Files:**
- Modify: wherever the Claude prompt/system instructions are stored (check `docs/` or `app/export/` for the export prompt)

- [ ] **Step 1: Find where the Claude prompt is defined**

```bash
grep -rn "muscle\|prompt\|system\|claude" app/export/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" -l 2>/dev/null | head -10
```

- [ ] **Step 2: Add muscle_groups instruction to the prompt**

Find the section that describes the session JSON structure and add:

```
- muscle_groups: array of lowercase strings from this exact list — chest, shoulders, triceps, biceps, forearms, back, lats, traps, core, glutes, quads, hamstrings, calves, full_body. Use full_body for HIIT/CrossFit/HYROX. Use an empty array [] for Rest days. Always populate this field.
```

- [ ] **Step 3: Commit**

```bash
git add <prompt file>
git commit -m "docs: add muscle_groups instructions to Claude prompt"
```

---

### Task 5: Push

- [ ] **Step 1: Push to remote**

```bash
git push origin master
```
