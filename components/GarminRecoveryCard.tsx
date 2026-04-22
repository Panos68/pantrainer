'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { GarminRecoveryDay } from '@/lib/schema'

interface GarminRecoveryCardProps {
  date: string
  recovery: GarminRecoveryDay | null | undefined
  compact?: boolean
  interactive?: boolean
  onFetched?: (data: GarminRecoveryDay) => void
}

export default function GarminRecoveryCard({
  date,
  recovery,
  compact = false,
  interactive = true,
  onFetched,
}: GarminRecoveryCardProps) {
  const [loading, setLoading] = useState(false)
  const [fetchedData, setFetchedData] = useState<GarminRecoveryDay | null>(null)
  const data = recovery ?? fetchedData
  const sleepHours = typeof data?.sleep_hours === 'number' && data.sleep_hours > 0 ? data.sleep_hours : null
  const deepSleepHours = typeof data?.deep_sleep_hours === 'number' && data.deep_sleep_hours > 0 ? data.deep_sleep_hours : null
  const remSleepHours = typeof data?.rem_sleep_hours === 'number' && data.rem_sleep_hours > 0 ? data.rem_sleep_hours : null
  const restingHr = typeof data?.resting_hr_bpm === 'number' && data.resting_hr_bpm > 0 ? data.resting_hr_bpm : null
  const maxHr = typeof data?.max_hr_bpm === 'number' && data.max_hr_bpm > 0 ? data.max_hr_bpm : null

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
        setFetchedData(json.recovery)
        onFetched?.(json.recovery)
      }
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    if (!restingHr && !sleepHours) {
      if (!interactive) {
        return (
          <span className="text-[10px] font-mono text-zinc-700 tracking-widest uppercase">
            No recovery
          </span>
        )
      }
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
        {sleepHours != null && (
          <span>💤 {sleepHours}h</span>
        )}
        {restingHr != null && (
          <span>❤️ {restingHr}bpm</span>
        )}
        {interactive && (
          <button
            onClick={(e) => { e.preventDefault(); void fetchRecovery(true) }}
            disabled={loading}
            className="text-zinc-700 hover:text-zinc-500 transition-colors"
            title="Refresh from Garmin"
          >
            ↻
          </button>
        )}
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
          {sleepHours != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Sleep</div>
              <div className="text-sky-400 text-lg font-mono font-black leading-none">{sleepHours}h</div>
              {(deepSleepHours != null || remSleepHours != null) && (
                <div className="text-zinc-600 text-[9px] font-mono mt-0.5">
                  deep {deepSleepHours}h · REM {remSleepHours}h
                </div>
              )}
            </div>
          )}
          {restingHr != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Resting HR</div>
              <div className="text-rose-400 text-lg font-mono font-black leading-none">{restingHr}</div>
              <div className="text-zinc-600 text-[9px] font-mono mt-0.5">bpm</div>
            </div>
          )}
          {maxHr != null && (
            <div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">Max HR</div>
              <div className="text-amber-400 text-lg font-mono font-black leading-none">{maxHr}</div>
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
