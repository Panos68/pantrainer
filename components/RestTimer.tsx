'use client'

import { useEffect, useState } from 'react'

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RestTimer({
  seconds,
  onDone,
  onSkip,
  onAddSeconds,
}: {
  seconds: number
  onDone: () => void
  onSkip: () => void
  onAddSeconds: (delta: number) => void
}) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) {
      onDone()
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [remaining, onDone])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-6xl font-mono tabular-nums">{formatMmSs(remaining)}</div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => { setRemaining((r) => r + 30); onAddSeconds(30) }}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          +30s
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm"
        >
          Skip rest
        </button>
      </div>
    </div>
  )
}
