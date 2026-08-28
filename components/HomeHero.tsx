'use client'

import type { HealthFlag } from '@/lib/schema'
import type { AdaptiveAlert } from '@/lib/adaptive-alert'
import type { ReadinessSnapshot } from '@/lib/readiness'
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
  calories: number
  caloriesDelta: number | null
  durationLabel: string
  durationDelta: number | null
  avgCalIntake: number
  avgCalIntakeDelta: number | null
  adaptiveAlert: AdaptiveAlert | null
  today: string
  initialReadiness: ReadinessSnapshot
}

function pctLabel(delta: number | null): string | undefined {
  if (delta == null) return undefined
  return `${delta > 0 ? '+' : ''}${delta}% vs last wk`
}

function WeekTile({ label, value, valueClassName, interpretation }: { label: string; value: string; valueClassName?: string; interpretation?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-3 flex flex-col justify-between min-w-[7.5rem]">
      <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1">{label}</p>
      <span className={`font-display font-bold text-2xl leading-none tabular-nums ${valueClassName ?? 'text-zinc-100'}`}>
        {value}
      </span>
      {interpretation && <p className="text-zinc-600 text-[10px] font-mono mt-1 truncate">{interpretation}</p>}
    </div>
  )
}

function WeekStatsRow({ weekLoad, loadDelta, acwr, loadZone, calories, caloriesDelta, durationLabel, durationDelta, avgCalIntake, avgCalIntakeDelta }: Omit<HomeHeroProps, 'healthFlags' | 'adaptiveAlert' | 'today' | 'initialReadiness'>) {
  const displayLoad = useCountUp(weekLoad)
  const displayAcwrHundredths = useCountUp(acwr != null ? Math.round(acwr * 100) : 0)

  const loadInterpretation = [
    loadDelta != null ? `${loadDelta > 0 ? '+' : ''}${loadDelta}% vs last wk` : null,
    loadZone && acwr != null ? `${(displayAcwrHundredths / 100).toFixed(2)} ${loadZone.label}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Not enough history yet'

  return (
    <div className="grid grid-cols-4 gap-3">
      <WeekTile
        label="Week's Load"
        value={weekLoad > 0 ? String(displayLoad) : '—'}
        valueClassName="text-cyan-400"
        interpretation={loadInterpretation}
      />
      <WeekTile
        label="Week's Calories"
        value={calories > 0 ? calories.toLocaleString() : '—'}
        interpretation={pctLabel(caloriesDelta)}
      />
      <WeekTile
        label="Week's Training Time"
        value={durationLabel}
        interpretation={pctLabel(durationDelta)}
      />
      <WeekTile
        label="Avg Cal Intake"
        value={avgCalIntake > 0 ? avgCalIntake.toLocaleString() : '—'}
        interpretation={pctLabel(avgCalIntakeDelta)}
      />
    </div>
  )
}

export default function HomeHero({ weekLoad, loadDelta, acwr, loadZone, healthFlags, calories, caloriesDelta, durationLabel, durationDelta, avgCalIntake, avgCalIntakeDelta, adaptiveAlert, today, initialReadiness }: HomeHeroProps) {
  const hasActiveFlags = healthFlags.some((f) => !f.cleared)

  return (
    <div className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 100% 0%, rgba(34,211,238,0.06) 0%, transparent 70%)' }}
      />
      <div className="relative">
        <RecoveryScorePanel today={today} initialData={initialReadiness} />
      </div>
      <div className="relative border-t border-zinc-800 pt-4">
        <WeekStatsRow
          weekLoad={weekLoad}
          loadDelta={loadDelta}
          acwr={acwr}
          loadZone={loadZone}
          calories={calories}
          caloriesDelta={caloriesDelta}
          durationLabel={durationLabel}
          durationDelta={durationDelta}
          avgCalIntake={avgCalIntake}
          avgCalIntakeDelta={avgCalIntakeDelta}
        />
      </div>
      <div className="relative space-y-4">
        <AdaptiveAlertBanner alert={adaptiveAlert} today={today} />
        {hasActiveFlags && <HealthFlagsBanner flags={healthFlags} />}
      </div>
    </div>
  )
}
