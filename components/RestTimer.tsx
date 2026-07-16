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
 * Render with a `key` that changes per rest period (e.g. the queue step index)
 * so remaining-time state resets via remount instead of a synced effect.
 *
 * Countdown is timestamp-based (endAt = Date.now() + seconds*1000) rather than
 * accumulated per-second decrements, so it self-corrects after the tab is
 * backgrounded/throttled instead of drifting or freezing.
 *
 * When `storageKey` is provided, the endAt timestamp is persisted to
 * localStorage so navigating away from the live page and back (which
 * unmounts/remounts this component) resumes the same countdown instead of
 * restarting it from `seconds`.
 */
export default function RestTimer({
  seconds,
  onDone,
  onSkip,
  onAddSeconds,
  storageKey,
}: {
  seconds: number
  onDone: () => void
  onSkip: () => void
  onAddSeconds: (delta: number) => void
  storageKey?: string
}) {
  const endAtRef = useRef<number | null>(null)
  const [remaining, setRemaining] = useState(seconds)
  const hasBeepedAt5 = useRef(false)
  const hasBeepedAt0 = useRef(false)
  const hasNotified = useRef(false)

  useEffect(() => {
    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : null
    const endAt = stored && stored > Date.now() ? stored : Date.now() + seconds * 1000
    endAtRef.current = endAt
    if (storageKey) localStorage.setItem(storageKey, String(endAt))
    const tick = () => {
      const currentEndAt = endAtRef.current ?? Date.now()
      const next = Math.max(0, Math.round((currentEndAt - Date.now()) / 1000))
      setRemaining(next)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [seconds, storageKey])

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
        notifyTimerDone('Rest timer done')
      }
      if (storageKey) localStorage.removeItem(storageKey)
      onDone()
    }
  }, [remaining, onDone, storageKey])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-6xl font-mono tabular-nums">{formatMmSs(remaining)}</div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            const nextEndAt = (endAtRef.current ?? Date.now()) + 30000
            endAtRef.current = nextEndAt
            if (storageKey) localStorage.setItem(storageKey, String(nextEndAt))
            setRemaining((r) => r + 30)
            onAddSeconds(30)
          }}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          +30s
        </button>
        <button
          type="button"
          onClick={() => {
            if (storageKey) localStorage.removeItem(storageKey)
            onSkip()
          }}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Skip rest
        </button>
      </div>
    </div>
  )
}
