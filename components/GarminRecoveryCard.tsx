'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => { setData(recovery) }, [recovery])

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
          onClick={(e) => { e.preventDefault(); void fetchRecovery() }}
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
          onClick={(e) => { e.preventDefault(); void fetchRecovery(true) }}
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
          onClick={() => void fetchRecovery(data != null)}
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
