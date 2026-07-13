# Home Hero Redesign Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

A prospective buyer described the app as "a nice MVP" but said the UI/UX needs real polish before it could be sold. The home page (`app/page.tsx`) is functionally strong (recovery score, ACWR, adaptive alerts, health flags) but reads as an engineer's dashboard: every section is a same-weight `bg-zinc-900` box, the accent color (`lime-400`) is applied indiscriminately to buttons, badges, and numbers so nothing stands out, and every number uses the same monospace type with no size hierarchy. There's no visual "here's the one thing that matters right now" moment, and no motion.

## Direction

**Aesthetic:** Athletic performance lab (WHOOP/Oura-inspired) — near-black base, one electric accent, oversized numeric hero stats, subtle depth/glow, still dark-mode-native.

**Scope:** Home page only (`app/page.tsx` and the components it composes for the top of the page). `/progress`, `/setup`, `/export`, and `WeekBrowser`/`HomeQuickPanels` internals are out of scope for this pass, aside from restyling them to read as visually secondary. Any shared atom touched here (e.g. `NewWeekButton`) will affect other pages too — called out explicitly below, not treated as scope creep.

## Palette

- Base stays near-black zinc (`zinc-950`/`zinc-900`) — unchanged.
- New single accent: **electric cyan** (`cyan-400`, `#22d3ee`-ish), used only for "this is the number/action that matters" — hero stat digits with no inherent semantic zone, primary CTA, active/focus states, section-divider accents.
- Existing semantic colors (green/amber/red for recovery zones, ACWR risk, health-flag severity) are unchanged — cyan never overrides a semantic color.
- `lime-400` is removed from decorative/default use (buttons, dividers, generic labels). It may remain only where it already carries specific chart-legend meaning (e.g. `ActivityTrendChart`'s "Load" line) — those charts are out of scope for this pass and untouched.

## Typography

- Add **Chakra Petch** via `next/font/google`, alongside the existing `Geist`/`Geist_Mono` (same loader pattern already in `app/layout.tsx`), exposed as `--font-chakra`.
- Chakra Petch is used *only* for hero numbers: recovery score total, today's load, ACWR value — sizes roughly 56–96px depending on container.
- Geist Mono remains the label/timestamp/technical-detail font everywhere, unchanged.
- No other typography changes (body copy, nav, buttons keep current fonts).

## Layout

Current home page order: stats bar → (quick panels + recovery panel) → adaptive alert banner → health flags banner → week browser.

New structure — two visual bands, no logic changes to any existing component's data-fetching or business logic:

1. **Hero band** (new `HomeHero` wrapper, top of page, full width):
   - Left: `RecoveryScorePanel`'s existing ring + breakdown bars, restyled — score digit switches to Chakra Petch at larger size; ring/label colors unchanged (already correctly semantic).
   - Right: today's Load number (Chakra Petch, cyan) and the ACWR value/zone badge (semantic color, unchanged logic from `app/page.tsx`), replacing the current `WeekStatsBar` "Load" cell.
   - `AdaptiveAlertBanner` and `HealthFlagsBanner` render *inside* this hero band as slim inline strips (visually nested, not separate boxes below) when active; hidden entirely when there's nothing to show, same as today.
   - Implementation note: this is a *visual regrouping*, not a merge of the four components' internals — each keeps its own file, props, and fetch logic. `HomeHero` is a new thin layout component that arranges the existing components together with shared border/background treatment.

2. **Detail band** (below, visually demoted — smaller type, muted zinc, no accent color):
   - Calories/Time stats (remaining half of the old `WeekStatsBar`).
   - `HomeQuickPanels`, `WeekBrowser` — unchanged internals, restyled container only (less visual weight than the hero band: thinner borders, smaller headers).

## Motion

Using Framer Motion (already available in the `frontend-design` toolchain; add as a dependency if not already present):
- On mount: recovery ring's stroke-dashoffset animates from 0→target (not instant).
- Hero numbers (recovery score, load, ACWR) count up from 0 on mount.
- Detail-band cards fade/slide in with a small stagger (~40ms per card) after the hero band settles.
- All motion respects `prefers-reduced-motion` (skip straight to end state).

## What Does NOT Change

- No API routes, data fetching, or business logic (recovery score calc, ACWR calc, adaptive alert logic, health flag clearing) change in this pass.
- `/progress`, `/setup`, `/export` pages are untouched.
- `ActivityTrendChart`/`PmcChart` (already reworked in the prior session) are untouched.
- `WeekBrowser` and `HomeQuickPanels` internals are untouched beyond container restyling.

## Risks / Open Questions

- `NewWeekButton` is a shared component (used on the empty-state home screen and possibly elsewhere) currently styled with `lime-400`. Restyling it to cyan for consistency with the new hero accent affects every place it's rendered — acceptable since it's a small shared atom, but flagged here rather than silently expanded.
- Chakra Petch is a fairly bold/angular typeface — if the count-up numbers feel too "loud" once implemented, fallback is to keep the font but drop the count-up animation, or size hero numbers down slightly.
