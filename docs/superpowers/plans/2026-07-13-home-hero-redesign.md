# Home Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the pantrainer home page into a hero-band/detail-band layout with an "athletic performance lab" aesthetic (electric cyan accent, Chakra Petch display font for hero numbers, subtle mount animations), per `docs/superpowers/specs/2026-07-13-home-hero-redesign-design.md`.

**Architecture:** Add a shared count-up hook and a new `HomeHero` client component that visually regroups the existing `RecoveryScorePanel`, `AdaptiveAlertBanner`, and `HealthFlagsBanner` components (unchanged data-fetching logic) alongside a new load/ACWR hero stat. `app/page.tsx` is restructured to render `HomeHero` at the top and demote the remaining stats/panels/week-browser to a visually secondary "detail band."

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 (CSS `@theme inline` tokens), `next/font/google`, Framer Motion (new dependency).

## Global Constraints

- Scope is the home page only: `app/page.tsx` and the components it composes at the top of the page (`RecoveryScorePanel`, `AdaptiveAlertBanner`, `HealthFlagsBanner`, plus the new `HomeHero`). `/progress`, `/setup`, `/export`, and the internals of `WeekBrowser`/`HomeQuickPanels` are unchanged.
- Cyan (`cyan-400`) is the only new accent, used exclusively for hero values with no inherent semantic meaning (today's load number, primary CTA, wordmark). It must never replace the existing semantic colors (green/amber/red for recovery zone, ACWR risk zone, health-flag severity).
- Chakra Petch (exposed as the `font-display` Tailwind utility) is used only for hero numbers: recovery score total, today's load, ACWR value. Geist Mono remains unchanged everywhere else.
- All new motion (ring fill, count-up, stagger fade-in) uses Framer Motion and must respect `prefers-reduced-motion` (skip straight to end state).
- No changes to API routes, data-fetching, or business logic (recovery score calc, ACWR calc, adaptive alert logic, health-flag clearing) in this plan.
- No test framework exists in this repo — verification is `npx tsc --noEmit` plus a manual dev-server visual check at the end, not automated tests.

---

### Task 1: Install Framer Motion and add the Chakra Petch display font

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `font-display` Tailwind utility class, usable in any subsequent task's className strings.
- Produces: `framer-motion` package importable as `import { motion, animate, useReducedMotion } from 'framer-motion'` in subsequent tasks.
- Produces: `.animate-fade-in-up` CSS class (plain CSS, no JS import needed) for the detail-band stagger in Task 5.

- [ ] **Step 1: Install framer-motion**

Run: `npm install framer-motion`
Expected: package.json and package-lock.json updated with a `framer-motion` entry; command exits 0.

- [ ] **Step 2: Verify the dependency landed**

Run: `grep -n "framer-motion" package.json`
Expected: one line showing `"framer-motion": "^<version>"` under `dependencies`.

- [ ] **Step 3: Add the Chakra Petch font in the root layout**

In `app/layout.tsx`, change the import line:

```ts
import { Geist, Geist_Mono } from "next/font/google";
```

to:

```ts
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
```

Then, directly after the `geistMono` declaration, add:

```ts
const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "700"],
});
```

Then update the `<html>` element's `className` from:

```tsx
className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
```

to:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable} h-full antialiased dark`}
```

- [ ] **Step 4: Expose the font as a Tailwind utility**

In `app/globals.css`, inside the existing `@theme inline { ... }` block, add a line directly after `--font-mono: var(--font-geist-mono);`:

```css
--font-display: var(--font-chakra);
```

- [ ] **Step 5: Add a CSS-only staggered fade-in utility for the detail band**

The hero band animates via Framer Motion (client component), but the detail band on the home page is rendered by a server component (`app/page.tsx`) and doesn't need a client-side dependency just for a simple entrance fade. Add a plain CSS keyframe animation instead.

At the end of `app/globals.css` (after the `@layer base { ... }` block), add:

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.4s ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up {
    animation: none;
  }
}
```

- [ ] **Step 6: Typecheck and confirm the dev server boots**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev` (start in background, then check `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns `200` or a redirect code, then stop the dev server)
Expected: server starts without throwing on the new font import.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json app/layout.tsx app/globals.css
git commit -m "feat(home): add framer-motion and Chakra Petch display font"
```

---

### Task 2: Shared count-up hook

**Files:**
- Create: `lib/useCountUp.ts`

**Interfaces:**
- Consumes: `framer-motion`'s `animate` and `useReducedMotion` (from Task 1).
- Produces: `useCountUp(target: number, duration?: number): number` — a React hook returning the current animated value, importable as `import { useCountUp } from '@/lib/useCountUp'`. Must be called unconditionally (before any early `return`) in any component that uses it, per Rules of Hooks.

- [ ] **Step 1: Write the hook**

```ts
'use client'

import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

export function useCountUp(target: number, duration = 1): number {
  const [value, setValue] = useState(0)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target)
      return
    }
    const controls = animate(0, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    })
    return () => controls.stop()
  }, [target, duration, prefersReducedMotion])

  return value
}
```

Save to `lib/useCountUp.ts`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the hook is unused so far, which is fine — it will be wired into components in Tasks 3 and 4).

- [ ] **Step 3: Commit**

```bash
git add lib/useCountUp.ts
git commit -m "feat(home): add useCountUp hook for animated hero numbers"
```

---

### Task 3: Restyle RecoveryScorePanel for embedding in the hero band

**Files:**
- Modify: `components/RecoveryScorePanel.tsx`

**Interfaces:**
- Consumes: `useCountUp` from Task 2, `motion`/`useReducedMotion` from `framer-motion` (Task 1).
- Produces: no prop/export signature change — `RecoveryScorePanel` still takes no props and is used exactly as `<RecoveryScorePanel />`. Only its internal markup and styling change (outer card chrome removed, score digit uses `font-display` + count-up + larger size, ring fill animates on mount). Task 4 (`HomeHero`) relies on this component now rendering without its own competing outer border/background.

- [ ] **Step 1: Update imports**

At the top of `components/RecoveryScorePanel.tsx`, change:

```ts
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
```

to:

```ts
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { useCountUp } from '@/lib/useCountUp'
```

- [ ] **Step 2: Animate the score ring**

Replace the entire `ScoreRing` function:

```tsx
function ScoreRing({ total, color }: { total: number; color: 'green' | 'amber' | 'red' }) {
  const radius = 44
  const stroke = 5
  const size = (radius + stroke) * 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (total / 100) * circumference
  const ringColor = COLOR[color].ring

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}
```

with:

```tsx
function ScoreRing({ total, color }: { total: number; color: 'green' | 'amber' | 'red' }) {
  const prefersReducedMotion = useReducedMotion()
  const radius = 44
  const stroke = 5
  const size = (radius + stroke) * 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (total / 100) * circumference
  const ringColor = COLOR[color].ring

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeLinecap="round"
        initial={{ strokeDashoffset: prefersReducedMotion ? offset : circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  )
}
```

- [ ] **Step 3: Animate the score number and wire the count-up hook**

Inside the `RecoveryScorePanel` component function, directly after the existing `useState` declarations (after `const [saveError, setSaveError] = useState<string | null>(null)`), add:

```ts
  const displayScore = useCountUp(data?.score.total ?? 0)
```

This must be called before the `if (loading)` and `if (!data) return null` guards, since it's a hook.

- [ ] **Step 4: Simplify the loading skeleton to not compete visually with the hero card**

Replace:

```tsx
  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-32 mb-3" />
        <div className="h-10 bg-zinc-800 rounded w-20" />
      </div>
    )
  }
```

with:

```tsx
  if (loading) {
    return (
      <div className="w-full md:flex-1 animate-pulse space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-32" />
        <div className="h-10 bg-zinc-800 rounded w-20" />
      </div>
    )
  }
```

- [ ] **Step 5: Remove the outer card border/background and enlarge the score digit**

Replace:

```tsx
  return (
    <div
      className={`border ${c.border} rounded-xl p-3 overflow-hidden`}
      style={{ background: `radial-gradient(ellipse 60% 80% at 95% 50%, ${c.glow} 0%, transparent 60%), #18181b` }}
    >
```

with:

```tsx
  return (
    <div
      className="w-full md:flex-1 relative overflow-hidden rounded-xl p-3"
      style={{ background: `radial-gradient(ellipse 60% 80% at 95% 50%, ${c.glow} 0%, transparent 60%)` }}
    >
```

- [ ] **Step 6: Use the animated score value with the display font**

Replace:

```tsx
            <div className="flex flex-col items-center">
              <span className={`text-4xl font-black leading-none ${c.score}`}>{score.total}</span>
              <span className="text-zinc-600 text-[10px] font-mono">/100</span>
            </div>
```

with:

```tsx
            <div className="flex flex-col items-center">
              <span className={`font-display font-bold text-6xl leading-none tabular-nums ${c.score}`}>{displayScore}</span>
              <span className="text-zinc-600 text-[10px] font-mono">/100</span>
            </div>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/RecoveryScorePanel.tsx
git commit -m "feat(home): animate recovery score ring/number, remove outer card chrome"
```

---

### Task 4: Create the HomeHero component

**Files:**
- Create: `components/HomeHero.tsx`

**Interfaces:**
- Consumes: `RecoveryScorePanel` (Task 3, no props), `AdaptiveAlertBanner` (no props, existing), `HealthFlagsBanner` (`{ flags: HealthFlag[] }`, existing), `useCountUp` (Task 2), `HealthFlag` type from `@/lib/schema`, `motion` from `framer-motion`.
- Produces: default export `HomeHero(props: { weekLoad: number; loadDelta: number | null; acwr: number | null; loadZone: { label: string; color: string } | null; healthFlags: HealthFlag[] }): JSX.Element`. Task 5 (`app/page.tsx`) renders this with those exact prop names.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { motion } from 'framer-motion'
import type { HealthFlag } from '@/lib/schema'
import RecoveryScorePanel from './RecoveryScorePanel'
import AdaptiveAlertBanner from './AdaptiveAlertBanner'
import HealthFlagsBanner from './HealthFlagsBanner'
import { useCountUp } from '@/lib/useCountUp'

interface HomeHeroProps {
  weekLoad: number
  loadDelta: number | null
  acwr: number | null
  loadZone: { label: string; color: string } | null
  healthFlags: HealthFlag[]
}

function HeroLoadStat({ weekLoad, loadDelta, acwr, loadZone }: Omit<HomeHeroProps, 'healthFlags'>) {
  const displayLoad = useCountUp(weekLoad)
  const displayAcwrHundredths = useCountUp(acwr != null ? Math.round(acwr * 100) : 0)

  return (
    <div className="text-left md:text-right shrink-0">
      <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1">
        This Week&rsquo;s Load
      </p>
      <div className="flex items-baseline gap-3 md:justify-end">
        <span className="font-display font-bold text-6xl text-cyan-400 leading-none tabular-nums">
          {weekLoad > 0 ? displayLoad : '—'}
        </span>
        {loadDelta != null && (
          <span className={`text-xs font-mono font-bold ${loadDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {loadDelta > 0 ? `+${loadDelta}%` : `${loadDelta}%`}
          </span>
        )}
      </div>
      {loadZone && acwr != null && (
        <p className={`mt-2 font-display font-bold text-lg ${loadZone.color}`}>
          {(displayAcwrHundredths / 100).toFixed(2)}{' '}
          <span className="text-xs font-mono uppercase tracking-widest">{loadZone.label}</span>
        </p>
      )}
    </div>
  )
}

export default function HomeHero({ weekLoad, loadDelta, acwr, loadZone, healthFlags }: HomeHeroProps) {
  const hasActiveFlags = healthFlags.some((f) => !f.cleared)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4"
    >
      <div className="flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <RecoveryScorePanel />
        <HeroLoadStat weekLoad={weekLoad} loadDelta={loadDelta} acwr={acwr} loadZone={loadZone} />
      </div>
      <AdaptiveAlertBanner />
      {hasActiveFlags && <HealthFlagsBanner flags={healthFlags} />}
    </motion.div>
  )
}
```

Save to `components/HomeHero.tsx`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/HomeHero.tsx
git commit -m "feat(home): add HomeHero component grouping recovery, load/ACWR, and alerts"
```

---

### Task 5: Wire HomeHero into the home page and demote the detail band

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `HomeHero` (Task 4) with props `{ weekLoad, loadDelta, acwr, loadZone, healthFlags }` — all five already computed as local variables in this file (`weekLoad`, `loadDelta`, `acwr`, `loadZone`, `week.health_flags`).

- [ ] **Step 1: Update imports**

Replace:

```ts
import HealthFlagsBanner from '@/components/HealthFlagsBanner'
import WeekBrowser from '@/components/WeekBrowser'
import HomeQuickPanels from '@/components/HomeQuickPanels'
import RecoveryScorePanel from '@/components/RecoveryScorePanel'
import AdaptiveAlertBanner from '@/components/AdaptiveAlertBanner'
```

with:

```ts
import WeekBrowser from '@/components/WeekBrowser'
import HomeQuickPanels from '@/components/HomeQuickPanels'
import HomeHero from '@/components/HomeHero'
```

- [ ] **Step 2: Simplify WeekStatsBar to calories/time only, with demoted styling**

Replace the entire `WeekStatsBar` function:

```tsx
function WeekStatsBar({
  calories, durationMin, load, loadDelta, loadZone, acwr,
}: {
  calories: number
  durationMin: number
  load: number
  loadDelta: number | null
  loadZone: { label: string; color: string } | null
  acwr: number | null
}) {
  return (
    <div className="flex gap-6 sm:gap-10">
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Calories</p>
        <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">
          {calories > 0 ? calories.toLocaleString() : '—'}
        </p>
      </div>
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Time</p>
        <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">{formatDuration(durationMin)}</p>
      </div>
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Load</p>
        <div className="flex items-baseline gap-2">
          <p className="text-zinc-50 text-lg font-black tabular-nums leading-none">
            {load > 0 ? load.toString() : '—'}
          </p>
          {loadZone && (
            <span className={`text-[11px] font-mono font-bold uppercase ${loadZone.color}`}>
              {loadZone.label}{acwr != null ? ` (${acwr.toFixed(2)})` : ''}
            </span>
          )}
          {loadDelta != null && (
            <span className={`text-[11px] font-mono font-bold ${loadDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {loadDelta > 0 ? `+${loadDelta}%` : `${loadDelta}%`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

with:

```tsx
function WeekStatsBar({ calories, durationMin }: { calories: number; durationMin: number }) {
  return (
    <div className="flex gap-6 sm:gap-10">
      <div>
        <p className="text-zinc-600 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Calories</p>
        <p className="text-zinc-300 text-base font-bold tabular-nums leading-none">
          {calories > 0 ? calories.toLocaleString() : '—'}
        </p>
      </div>
      <div>
        <p className="text-zinc-600 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">Total Time</p>
        <p className="text-zinc-300 text-base font-bold tabular-nums leading-none">{formatDuration(durationMin)}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Recolor the empty-state wordmark and CTA from lime to cyan**

Replace:

```tsx
          <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">
            PanTrainer
          </p>
```

(the one inside the `if (!week)` empty-state block) with:

```tsx
          <p className="text-cyan-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">
            PanTrainer
          </p>
```

Replace:

```tsx
              className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
```

with:

```tsx
              className="w-full h-14 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
```

- [ ] **Step 4: Recolor the main header wordmark from lime to cyan**

Replace:

```tsx
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
```

with:

```tsx
            <p className="text-cyan-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
```

- [ ] **Step 5: Remove the now-unused `hasActiveFlags` local variable**

Delete this line (its logic now lives inside `HomeHero`):

```tsx
  const hasActiveFlags = week.health_flags.some((f) => !f.cleared)
```

- [ ] **Step 6: Replace the hero/detail section markup**

Replace:

```tsx
        <div>
          <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2">This Week</p>
          <WeekStatsBar calories={weekCalories} durationMin={weekDurationMin} load={weekLoad} loadDelta={loadDelta} loadZone={loadZone} acwr={acwr} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 items-start">
          <HomeQuickPanels week={week} todayISO={todayISO} baselineRhr={profile.rhr_bpm} />
          <RecoveryScorePanel />
        </div>

        <AdaptiveAlertBanner />

        <div className="space-y-3">
          {hasActiveFlags && <HealthFlagsBanner flags={week.health_flags} />}
        </div>

        <WeekBrowser weeks={[...archivedWeeks, week]} pendingWeek={pendingWeek ?? undefined} todayISO={todayISO} />
```

with:

```tsx
        <HomeHero
          weekLoad={weekLoad}
          loadDelta={loadDelta}
          acwr={acwr}
          loadZone={loadZone}
          healthFlags={week.health_flags}
        />

        <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <p className="text-zinc-600 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2">This Week</p>
          <WeekStatsBar calories={weekCalories} durationMin={weekDurationMin} />
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '40ms' }}>
          <HomeQuickPanels week={week} todayISO={todayISO} baselineRhr={profile.rhr_bpm} />
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <WeekBrowser weeks={[...archivedWeeks, week]} pendingWeek={pendingWeek ?? undefined} todayISO={todayISO} />
        </div>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Specifically confirm there is no leftover reference to `RecoveryScorePanel`, `AdaptiveAlertBanner`, or `HealthFlagsBanner` imports in this file (they're now only imported inside `HomeHero`).

Run: `grep -n "RecoveryScorePanel\|AdaptiveAlertBanner\|HealthFlagsBanner" app/page.tsx`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): wire HomeHero into home page, demote detail band, cyan accent"
```

---

### Task 6: Visual QA pass

**Files:** none (verification only)

**Interfaces:** none — this task only observes the running app.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (in background)
Expected: server starts on `http://localhost:3000` without errors in the terminal.

- [ ] **Step 2: Load the home page and check for console/runtime errors**

Use the `run` skill (or the Claude-in-Chrome browser tools) to navigate to `http://localhost:3000`, wait for the page to settle, and read the browser console.
Expected: no red console errors; the hero band renders at the top with the recovery ring on the left and the load/ACWR numbers on the right in the larger Chakra Petch font; the ring visibly fills and the numbers count up shortly after load.

- [ ] **Step 3: Confirm reduced-motion is respected**

Using the browser devtools, emulate `prefers-reduced-motion: reduce`, then reload the page.
Expected: the ring is immediately at its final fill and the hero numbers show their final values with no count-up animation.

- [ ] **Step 4: Confirm the detail band reads as visually secondary and staggers in**

Visually compare the hero band (border, larger/brighter numbers) against the calories/time stats, quick panels, and week browser below it.
Expected: the detail band uses smaller, more muted (`zinc-300`/`zinc-600`) text with no cyan, clearly reading as secondary to the hero band; on load, the three detail-band sections (stats, quick panels, week browser) fade/slide in with a slight stagger rather than popping in all at once.

- [ ] **Step 5: Stop the dev server**

Stop the background `npm run dev` process.

- [ ] **Step 6: Final typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

(No commit in this task — it's verification only. If any visual issue is found, fix it in the relevant task's file and commit as a follow-up fix.)
