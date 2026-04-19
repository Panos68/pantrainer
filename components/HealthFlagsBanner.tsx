'use client'

import type { HealthFlag } from '@/lib/schema'

interface HealthFlagsBannerProps {
  flags: HealthFlag[]
}

export default function HealthFlagsBanner({ flags }: HealthFlagsBannerProps) {
  const activeFlags = flags.filter((f) => !f.cleared)
  if (activeFlags.length === 0) return null

  async function handleClear(index: number) {
    const updatedFlags = flags.map((f, i) =>
      i === index ? { ...f, cleared: true } : f
    )
    await fetch('/api/week/current', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ health_flags: updatedFlags }),
    })
    window.location.reload()
  }

  // Determine severity — red if any critical, amber otherwise
  const hasCritical = activeFlags.some(
    (f) => f.status?.toLowerCase().includes('critical') ||
           f.status?.toLowerCase().includes('severe') ||
           f.training_impact?.toLowerCase().includes('stop')
  )

  return (
    <div
      className={`px-4 py-3 rounded-xl border ${
        hasCritical
          ? 'bg-red-400/10 border-red-400/30'
          : 'bg-amber-400/10 border-amber-400/30'
      }`}
    >
      <p
        className={`text-xs font-mono font-bold tracking-widest uppercase mb-2 ${
          hasCritical ? 'text-red-400' : 'text-amber-400'
        }`}
      >
        {hasCritical ? '⚠ HEALTH FLAGS — REVIEW BEFORE TRAINING' : '⚠ ACTIVE HEALTH FLAGS'}
      </p>
      <div className="space-y-2">
        {activeFlags.map((flag, i) => {
          const originalIndex = flags.indexOf(flag)
          return (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-xs font-mono font-bold tracking-wide ${
                    hasCritical ? 'text-red-300' : 'text-amber-300'
                  }`}
                >
                  {flag.flag.toUpperCase()}
                </span>
                {flag.location && (
                  <span className="text-zinc-500 text-xs font-mono">
                    [{flag.location}]
                  </span>
                )}
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                    hasCritical
                      ? 'text-red-400 border-red-400/30 bg-red-400/10'
                      : 'text-amber-400 border-amber-400/30 bg-amber-400/10'
                  }`}
                >
                  {flag.status}
                </span>
                {flag.training_impact && (
                  <span className="text-zinc-500 text-xs font-mono truncate">
                    — {flag.training_impact}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleClear(originalIndex)}
                className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-300 tracking-widest uppercase transition-colors px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
              >
                Clear
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
