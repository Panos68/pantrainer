'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { findLocalMedia } from '@/lib/exerciseMediaFallback'

interface WorkoutExercise {
  id: number
  exercise_name: string
  videoURL: string[]
  youtubeURL: string
}

const localCache = new Map<string, WorkoutExercise | null>()
const UNPLAYABLE_TIMEOUT_MS = 4000

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
  const [videoFailed, setVideoFailed] = useState(false)
  const [youtubeFailed, setYoutubeFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const unplayableTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || match !== undefined) return
    lookupExercise(name).then((result) => {
      setMatch(result)
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

  useEffect(() => {
    return () => {
      if (unplayableTimer.current) clearTimeout(unplayableTimer.current)
    }
  }, [])

  const youtubeEmbed = match?.youtubeURL ?? null
  const videoUrl = match?.videoURL?.[0] ?? null
  const youtubeWatch = youtubeEmbed ? youtubeEmbed.replace('/embed/', '/watch?v=') : null
  const youtubeLink = youtubeWatch ?? youtubeSearchUrl(name)

  const isLoading = open && match === undefined

  const noLiveMatch = match === null
  const shouldFallbackToStatic = noLiveMatch || (videoFailed && (!youtubeEmbed || youtubeFailed))
  const localMedia = shouldFallbackToStatic ? findLocalMedia(name) : null
  const showStaticImage = shouldFallbackToStatic && localMedia != null
  const showYoutube = !isLoading && (videoFailed || !videoUrl) && youtubeEmbed && !youtubeFailed && !shouldFallbackToStatic
  const showVideo = !isLoading && videoUrl && !videoFailed && !shouldFallbackToStatic

  function handleVideoLoadedMetadata() {
    const el = videoRef.current
    if (!el) return
    if (!Number.isFinite(el.duration) || el.duration === 0) {
      setVideoFailed(true)
      return
    }
    unplayableTimer.current = setTimeout(() => {
      if (el.readyState < 3) {
        // Never reached a playable state (HAVE_FUTURE_DATA) within the timeout.
        setVideoFailed(true)
      }
    }, UNPLAYABLE_TIMEOUT_MS)
  }

  function handleVideoCanPlay() {
    if (unplayableTimer.current) clearTimeout(unplayableTimer.current)
  }

  function handleYoutubeError() {
    setYoutubeFailed(true)
  }

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setVideoFailed(false)
          setYoutubeFailed(false)
          setOpen((v) => !v)
        }}
        className="text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
        title="How to perform"
      >
        ↗
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
          {isLoading && (
            <div className="p-3 text-zinc-500 text-[10px] font-mono">Loading…</div>
          )}

          {showVideo && (
            <video
              ref={videoRef}
              src={videoUrl!}
              autoPlay
              loop
              muted
              playsInline
              className="w-full"
              onError={() => setVideoFailed(true)}
              onLoadedMetadata={handleVideoLoadedMetadata}
              onCanPlay={handleVideoCanPlay}
            />
          )}

          {showYoutube && (
            <iframe
              src={youtubeEmbed!}
              title={`${name} exercise demo`}
              className="w-full aspect-video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onError={handleYoutubeError}
            />
          )}

          {showStaticImage && (
            <div className="relative w-full">
              <div className="grid grid-cols-2 gap-px bg-zinc-800">
                {localMedia!.images.slice(0, 2).map((img, i) => (
                  <div key={img} className="relative aspect-[3/2]">
                    <Image
                      src={`/exercise-media/${img}`}
                      alt={`${name} demo — ${i === 0 ? 'start' : 'end'} position`}
                      fill
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
              <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-zinc-950/80 text-zinc-400 text-[9px] font-mono uppercase tracking-widest">
                static
              </span>
            </div>
          )}

          {!isLoading && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <p className="text-zinc-300 text-[11px] font-mono font-bold truncate">
                {match ? match.exercise_name : name}
              </p>
              {!match && !showStaticImage && (
                <p className="text-zinc-600 text-[10px]">Not in database</p>
              )}
              {match && videoFailed && !shouldFallbackToStatic && (
                <p className="text-zinc-600 text-[10px]">Source video blocked — showing YouTube fallback.</p>
              )}
              <a
                href={youtubeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-red-400 transition-colors text-[10px]"
              >
                {youtubeWatch ? 'Open on YouTube ↗' : 'Search on YouTube ↗'}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
