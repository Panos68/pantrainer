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
        <span className="font-display font-bold text-3xl text-cyan-400 leading-none tabular-nums">
          {weekLoad > 0 ? displayLoad : '—'}
        </span>
        {loadDelta != null && (
          <span className={`text-xs font-mono font-bold ${loadDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {loadDelta > 0 ? `+${loadDelta}%` : `${loadDelta}%`}
          </span>
        )}
      </div>
      {loadZone && acwr != null && (
        <p className={`mt-1 font-display font-bold text-sm ${loadZone.color}`}>
          {(displayAcwrHundredths / 100).toFixed(2)}{' '}
          <span className="text-[10px] font-mono uppercase tracking-widest">{loadZone.label}</span>
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
      className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 100% 0%, rgba(34,211,238,0.06) 0%, transparent 70%)' }}
      />
      <div className="relative flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <RecoveryScorePanel />
        <HeroLoadStat weekLoad={weekLoad} loadDelta={loadDelta} acwr={acwr} loadZone={loadZone} />
      </div>
      <div className="relative space-y-4">
        <AdaptiveAlertBanner />
        {hasActiveFlags && <HealthFlagsBanner flags={healthFlags} />}
      </div>
    </motion.div>
  )
}
