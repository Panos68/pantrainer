'use client'

import { useEffect, useRef, useState } from 'react'
import { playBeep } from '@/lib/timerSound'
import { notifyTimerDone } from '@/lib/notify'

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Render with a `key` that changes per set so remaining-time state resets via
 * remount instead of a synced effect.
 *
 * While running, the countdown is timestamp-based: `endAt` (a ref) is set to
 * Date.now() + remaining*1000 whenever the timer starts/resumes, and each
 * ~250ms tick recomputes the displayed remaining seconds from that timestamp
 * rather than accumulating per-second decrements. This self-corrects after
 * the tab is backgrounded/throttled instead of drifting or freezing.
 */
export default function ExerciseTimer({ seconds, onSkip }: { seconds: number; onSkip?: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)
  const endAtRef = useRef(Date.now() + seconds * 1000)
  const hasBeepedAt5 = useRef(false)
  const hasBeepedAt0 = useRef(false)
  const hasNotified = useRef(false)

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const next = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000))
      setRemaining(next)
      if (next <= 0) setRunning(false)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (remaining === 5 && !hasBeepedAt5.current) {
      hasBeepedAt5.current = true
      playBeep(880, 150)
    }
    if (remaining === 0 && !hasBeepedAt0.current) {
      hasBeepedAt0.current = true
      playBeep(1200, 400)
      if (!hasNotified.current) {
        hasNotified.current = true
        notifyTimerDone('Exercise timer done')
      }
    }
  }, [remaining])

  const done = remaining <= 0

  function start() {
    endAtRef.current = Date.now() + remaining * 1000
    setRunning(true)
  }

  function reset() {
    setRunning(false)
    setRemaining(seconds)
    endAtRef.current = Date.now() + seconds * 1000
    hasBeepedAt5.current = false
    hasBeepedAt0.current = false
    hasNotified.current = false
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`text-5xl font-mono tabular-nums ${done ? 'text-lime-400' : ''}`}>
        {formatMmSs(remaining)}
      </div>
      <div className="flex gap-3">
        {!running && !done && (
          <button
            type="button"
            onClick={start}
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
            onClick={reset}
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
