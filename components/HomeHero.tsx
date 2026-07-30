'use client'

import { motion } from 'framer-motion'
import type { HealthFlag } from '@/lib/schema'
import type { AdaptiveAlert } from '@/lib/adaptive-alert'
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
  durationLabel: string
  adaptiveAlert: AdaptiveAlert | null
  today: string
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-600 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">{label}</p>
      <p className="text-zinc-300 text-lg font-bold tabular-nums leading-none">{value}</p>
    </div>
  )
}

function WeekStatsRow({ weekLoad, loadDelta, acwr, loadZone, calories, durationLabel }: Omit<HomeHeroProps, 'healthFlags' | 'adaptiveAlert' | 'today'>) {
  const displayLoad = useCountUp(weekLoad)
  const displayAcwrHundredths = useCountUp(acwr != null ? Math.round(acwr * 100) : 0)

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <div>
        <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-0.5">
          This Week&rsquo;s Load
        </p>
        <div className="flex items-baseline gap-3">
          <span className="font-display font-bold text-3xl text-cyan-400 leading-none tabular-nums">
            {weekLoad > 0 ? displayLoad : '—'}
          </span>
          {loadDelta != null && (
            <span className={`text-xs font-mono font-bold ${loadDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {loadDelta > 0 ? `+${loadDelta}%` : `${loadDelta}%`}
            </span>
          )}
          {loadZone && acwr != null && (
            <span className={`font-display font-bold text-sm ${loadZone.color}`}>
              {(displayAcwrHundredths / 100).toFixed(2)}{' '}
              <span className="text-[10px] font-mono uppercase tracking-widest">{loadZone.label}</span>
            </span>
          )}
        </div>
      </div>
      <StatMini label="Calories" value={calories > 0 ? calories.toLocaleString() : '—'} />
      <StatMini label="Time" value={durationLabel} />
    </div>
  )
}

export default function HomeHero({ weekLoad, loadDelta, acwr, loadZone, healthFlags, calories, durationLabel, adaptiveAlert, today }: HomeHeroProps) {
  const hasActiveFlags = healthFlags.some((f) => !f.cleared)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 100% 0%, rgba(34,211,238,0.06) 0%, transparent 70%)' }}
      />
      <div className="relative">
        <RecoveryScorePanel />
      </div>
      <div className="relative border-t border-zinc-800 pt-4">
        <WeekStatsRow
          weekLoad={weekLoad}
          loadDelta={loadDelta}
          acwr={acwr}
          loadZone={loadZone}
          calories={calories}
          durationLabel={durationLabel}
        />
      </div>
      <div className="relative space-y-4">
        <AdaptiveAlertBanner alert={adaptiveAlert} today={today} />
        {hasActiveFlags && <HealthFlagsBanner flags={healthFlags} />}
      </div>
    </motion.div>
  )
}
