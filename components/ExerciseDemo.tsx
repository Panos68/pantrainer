'use client'

import { useState, useEffect, useRef } from 'react'

interface WorkoutExercise {
  id: number
  exercise_name: string
  videoURL: string[]
  youtubeURL: string
}

const localCache = new Map<string, WorkoutExercise | null>()

async function lookupExercise(name: string): Promise<WorkoutExercise | null> {
  if (localCache.has(name)) return localCache.get(name)!
  const res = await fetch(`/api/exercise-demo?name=${encodeURIComponent(name)}`)
  if (!res.ok) return null
  const data = await res.json()
  localCache.set(name, data)
  return data
}

function youtubeSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name}`)}`
}

export default function ExerciseDemo({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [match, setMatch] = useState<WorkoutExercise | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || match !== undefined) return
    setLoading(true)
    lookupExercise(name).then((result) => {
      setMatch(result)
      setLoading(false)
    })
  }, [open, name, match])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const youtubeWatch = match?.youtubeURL
    ? match.youtubeURL.replace('/embed/', '/watch?v=')
    : null
  const youtubeLink = youtubeWatch ?? youtubeSearchUrl(name)

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
        title="How to perform"
      >
        ↗
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
          {loading && (
            <div className="p-3 text-zinc-500 text-[10px] font-mono">Loading…</div>
          )}

          {!loading && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <p className="text-zinc-300 text-[11px] font-mono font-bold truncate">
                {match ? match.exercise_name : name}
              </p>
              {!match && (
                <p className="text-zinc-600 text-[10px]">Not in database — searching YouTube</p>
              )}
              <a
                href={youtubeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-red-400 transition-colors text-[10px]"
              >
                {youtubeWatch ? 'Watch on YouTube ↗' : 'Search on YouTube ↗'}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
