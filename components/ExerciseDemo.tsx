'use client'

import { useState, useEffect, useRef } from 'react'

interface WorkoutExercise {
  id: number
  exercise_name: string
  videoURL: string[]
  youtubeURL: string
}

let exerciseCache: WorkoutExercise[] | null = null

async function getExercises(): Promise<WorkoutExercise[]> {
  if (exerciseCache) return exerciseCache
  const res = await fetch('https://workoutapi.vercel.app/exercises')
  if (!res.ok) return []
  exerciseCache = await res.json()
  return exerciseCache!
}

function findMatch(exercises: WorkoutExercise[], name: string): WorkoutExercise | null {
  const needle = name.toLowerCase()
  // Exact match first
  const exact = exercises.find((e) => e.exercise_name.toLowerCase() === needle)
  if (exact) return exact
  // Partial match — exercise name contains all words from the query
  const words = needle.split(/\s+/)
  return exercises.find((e) => {
    const hay = e.exercise_name.toLowerCase()
    return words.every((w) => hay.includes(w))
  }) ?? null
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
    getExercises().then((exercises) => {
      setMatch(findMatch(exercises, name))
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

  const videoUrl = match?.videoURL?.[0] ?? null
  const youtubeEmbed = match?.youtubeURL ?? null

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

          {!loading && videoUrl && (
            <video
              src={videoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full"
            />
          )}

          {!loading && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <p className="text-zinc-300 text-[11px] font-mono font-bold truncate">
                {match ? match.exercise_name : name}
              </p>
              {!match && (
                <p className="text-zinc-600 text-[10px]">Not found in database</p>
              )}
              {youtubeEmbed && (
                <a
                  href={youtubeEmbed.replace('/embed/', '/watch?v=')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-red-400 transition-colors text-[10px]"
                >
                  Watch on YouTube ↗
                </a>
              )}
              {!youtubeEmbed && (
                <a
                  href={youtubeSearchUrl(name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-red-400 transition-colors text-[10px]"
                >
                  Search on YouTube ↗
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
