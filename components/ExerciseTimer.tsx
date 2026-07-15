'use client'

import { useEffect, useState } from 'react'

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Render with a `key` that changes per set so remaining-time state resets via
 * remount instead of a synced effect.
 */
export default function ExerciseTimer({ seconds, onSkip }: { seconds: number; onSkip?: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    if (remaining <= 0) {
      setRunning(false)
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [running, remaining])

  const done = remaining <= 0

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`text-5xl font-mono tabular-nums ${done ? 'text-lime-400' : ''}`}>
        {formatMmSs(remaining)}
      </div>
      <div className="flex gap-3">
        {!running && !done && (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-semibold font-mono"
          >
            Start
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
          >
            Pause
          </button>
        )}
        {(running || remaining !== seconds) && (
          <button
            type="button"
            onClick={() => { setRunning(false); setRemaining(seconds) }}
            className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
          >
            Reset
          </button>
        )}
        {onSkip && !done && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Stop the timer early? The full planned time will still be logged.')) {
                setRunning(false)
                onSkip()
              }
            }}
            className="px-4 py-2 rounded bg-zinc-900 text-zinc-500 text-sm font-mono"
          >
            Skip timer
          </button>
        )}
      </div>
    </div>
  )
}
