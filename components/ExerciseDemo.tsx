'use client'

import { useState, useRef, useEffect } from 'react'

interface WgerExercise {
  id: number
}

interface WgerImage {
  image: string
  is_main: boolean
}

async function searchWger(name: string): Promise<{ exerciseId: number; imageUrl: string | null } | null> {
  const cached = sessionStorage.getItem(`wger:${name}`)
  if (cached) return JSON.parse(cached)

  try {
    // Search by name — language=2 is English
    const searchRes = await fetch(
      `https://wger.de/api/v2/exercise/?format=json&language=2&name=${encodeURIComponent(name)}&limit=5`
    )
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const exercises: WgerExercise[] = searchData.results ?? []
    if (!exercises.length) {
      sessionStorage.setItem(`wger:${name}`, JSON.stringify(null))
      return null
    }

    const exerciseId = exercises[0].id

    const imgRes = await fetch(
      `https://wger.de/api/v2/exerciseimage/?format=json&exercise_base=${exerciseId}&limit=3`
    )
    if (!imgRes.ok) {
      const result = { exerciseId, imageUrl: null }
      sessionStorage.setItem(`wger:${name}`, JSON.stringify(result))
      return result
    }
    const imgData = await imgRes.json()
    const images: WgerImage[] = imgData.results ?? []
    const main = images.find((i) => i.is_main) ?? images[0]
    const result = { exerciseId, imageUrl: main?.image ?? null }
    sessionStorage.setItem(`wger:${name}`, JSON.stringify(result))
    return result
  } catch {
    return null
  }
}

function youtubeSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name}`)}`
}

export default function ExerciseDemo({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ exerciseId: number; imageUrl: string | null } | null | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || result !== undefined) return
    setLoading(true)
    searchWger(name).then((r) => {
      setResult(r)
      setLoading(false)
    })
  }, [open, name, result])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
        title="How to perform"
      >
        ↗
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
          {loading && (
            <div className="p-3 text-zinc-500 text-[10px] font-mono">Loading…</div>
          )}

          {!loading && result?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.imageUrl}
              alt={name}
              className="w-full object-cover"
            />
          )}

          {!loading && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <p className="text-zinc-300 text-[11px] font-mono font-bold truncate">{name}</p>
              {result?.exerciseId ? (
                <a
                  href={`https://wger.de/en/exercise/${result.exerciseId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-zinc-300 text-[10px] transition-colors"
                >
                  View on wger ↗
                </a>
              ) : null}
              <a
                href={youtubeSearchUrl(name)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 text-[10px] transition-colors"
              >
                Search on YouTube ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
