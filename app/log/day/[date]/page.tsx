'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session, GarminRecoveryDay, RenphoMeasurementDay } from '@/lib/schema'
import GarminRecoveryCard from '@/components/GarminRecoveryCard'
import WeightCard from '@/components/WeightCard'

const TYPE_COLORS: Record<string, string> = {
  Strength: 'text-violet-400',
  Conditioning: 'text-sky-400',
  Recovery: 'text-emerald-400',
  Rest: 'text-zinc-500',
}

function resolvePhotoHref(pathname: string): string {
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) return pathname
  return `/api/photos?pathname=${encodeURIComponent(pathname)}`
}

function resolveFoodPhotoHref(pathname: string): string {
  return `/api/food-photos?pathname=${encodeURIComponent(pathname)}`
}

type NutritionEntry = {
  estimatedCalories: number
  macros?: { protein?: number; carbs?: number; fat?: number } | null
  meals?: Array<{
    name: string
    calories: number
    macros?: { protein?: number; carbs?: number; fat?: number } | null
  }> | null
  description: string
}

export default function ArchivedDayPage() {
  const params = useParams()
  const router = useRouter()
  const date = (params.date as string) ?? ''

  const [session, setSession] = useState<Session | null>(null)
  const [isCurrent, setIsCurrent] = useState(false)
  const [recovery, setRecovery] = useState<GarminRecoveryDay | null>(null)
  const [weight, setWeight] = useState<RenphoMeasurementDay | null>(null)
  const [nutritionEntry, setNutritionEntry] = useState<NutritionEntry | null>(null)
  const [foodPhotos, setFoodPhotos] = useState<string[]>([])
  const [foodNote, setFoodNote] = useState<string | null>(null)
  const [coachNote, setCoachNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!date) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [sessionRes, nutrition, photos, note, coach, weightRes] = await Promise.all([
          fetch(`/api/session/by-date/${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
          fetch(`/api/nutrition-log?date=${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/food-photos?date=${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/food-notes?date=${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/coach-note?date=${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/renpho/measurement?date=${date}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (cancelled) return
        setSession(sessionRes.session)
        setIsCurrent(Boolean(sessionRes.isCurrent))
        setRecovery(sessionRes.recovery ?? null)
        setWeight(weightRes?.measurement ?? null)
        setNutritionEntry(nutrition ?? null)
        setFoodPhotos(Array.isArray(photos?.photos) ? photos.photos : Array.isArray(photos) ? photos : [])
        setFoodNote(note?.text ?? null)
        setCoachNote(coach?.text ?? null)
      } catch {
        if (!cancelled) setError('Day not found.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [date])

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">Loading…</p>
      </main>
    )
  }

  if (error || !session) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-400 text-sm font-mono">No session found for {date}.</p>
        <button
          onClick={() => router.push('/')}
          className="h-11 px-5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-[0.15em] uppercase transition-colors"
        >
          Back to Home
        </button>
      </main>
    )
  }

  const typeColor = TYPE_COLORS[session.type] ?? 'text-zinc-400'
  const isCompleted = session.status === 'completed'
  const balance =
    typeof recovery?.total_kilocalories === 'number' && recovery.total_kilocalories > 0 && nutritionEntry
      ? recovery.total_kilocalories - nutritionEntry.estimatedCalories
      : null

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl font-black tracking-tight uppercase text-zinc-50">
              {session.day}
            </h1>
            <p className="text-zinc-600 text-xs font-mono mt-1">{date}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full border text-xs font-mono font-bold tracking-widest uppercase ${
              isCompleted
                ? 'bg-lime-400/10 text-lime-400 border-lime-400/30'
                : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'
            }`}
          >
            {session.status}
          </span>
        </header>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 flex items-center justify-between gap-3">
          <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
            Read-only archive
          </p>
          {isCurrent && (
            <Link
              href={`/log/${session.day.toLowerCase()}`}
              className="text-lime-400 text-xs font-mono font-bold tracking-widest uppercase hover:text-lime-300"
            >
              Edit this session →
            </Link>
          )}
        </div>

        {/* Session details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold tracking-wide uppercase ${typeColor}`}>{session.type}</span>
            {session.subtype && <span className="text-zinc-500 text-xs font-mono">{session.subtype}</span>}
          </div>

          {(session.duration_min != null || session.avg_hr_bpm != null || session.total_calories != null) && (
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-zinc-800">
              {session.duration_min != null && (
                <div>
                  <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-1">Duration</div>
                  <div className="text-lime-400 text-2xl font-mono font-black">{session.duration_min}</div>
                  <div className="text-zinc-600 text-[10px] font-mono">MIN</div>
                </div>
              )}
              {session.avg_hr_bpm != null && (
                <div>
                  <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-1">Avg HR</div>
                  <div className="text-sky-400 text-2xl font-mono font-black">{session.avg_hr_bpm}</div>
                  <div className="text-zinc-600 text-[10px] font-mono">BPM</div>
                </div>
              )}
              {session.total_calories != null && (
                <div>
                  <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-1">Calories</div>
                  <div className="text-violet-400 text-2xl font-mono font-black">{session.total_calories}</div>
                  <div className="text-zinc-600 text-[10px] font-mono">KCAL</div>
                </div>
              )}
            </div>
          )}

          {session.exercises && session.exercises.length > 0 && (
            <div className="pt-3 border-t border-zinc-800">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Exercises</div>
              <ul className="space-y-1.5">
                {session.exercises.map((ex, i) => (
                  <li key={i} className="text-xs font-mono space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-zinc-300 font-bold">{ex.name}</span>
                      <span className="text-zinc-600">
                        planned: {ex.sets}×{ex.reps}
                        {ex.weight_kg != null ? ` @ ${ex.weight_kg}kg` : ''}
                      </span>
                    </div>
                    {ex.actual_weight_kg != null && (
                      <div className="text-violet-400 pl-2">
                        actual: {ex.actual_sets ?? ex.sets}×{ex.actual_reps ?? ex.reps} @ {ex.actual_weight_kg}kg
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {session.notes && (
            <div className="pt-3 border-t border-zinc-800">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Notes</div>
              <p className="text-zinc-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">{session.notes}</p>
            </div>
          )}

          {session.photos.length > 0 && (
            <div className="pt-3 border-t border-zinc-800">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Photos</div>
              <ul className="space-y-1">
                {session.photos.map((p, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <a href={resolvePhotoHref(p)} target="_blank" rel="noreferrer" className="shrink-0">
                      <div
                        className="h-12 w-12 rounded border border-zinc-700 bg-zinc-800 bg-cover bg-center"
                        style={{ backgroundImage: `url("${resolvePhotoHref(p)}")` }}
                      />
                    </a>
                    <a
                      href={resolvePhotoHref(p)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-400 hover:text-zinc-200 text-xs font-mono break-all"
                    >
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recovery */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Recovery</div>
          <GarminRecoveryCard date={date} recovery={recovery} interactive={false} />
        </div>

        {weight?.weight_kg != null && <WeightCard measurement={weight} />}

        {/* Nutrition */}
        {(nutritionEntry || foodPhotos.length > 0 || foodNote || coachNote) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">Nutrition</div>

            {nutritionEntry && (
              <div className="space-y-1.5">
                <p className="text-zinc-100 font-display font-bold text-xl">
                  {nutritionEntry.estimatedCalories.toLocaleString()} cal
                </p>
                {nutritionEntry.macros && (
                  <p className="text-zinc-500 text-xs font-mono">
                    {[
                      nutritionEntry.macros.protein != null ? `${nutritionEntry.macros.protein}g protein` : null,
                      nutritionEntry.macros.carbs != null ? `${nutritionEntry.macros.carbs}g carbs` : null,
                      nutritionEntry.macros.fat != null ? `${nutritionEntry.macros.fat}g fat` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {nutritionEntry.meals && nutritionEntry.meals.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-zinc-800">
                    {nutritionEntry.meals.map((meal, i) => (
                      <li key={i} className="text-xs font-mono">
                        <span className="text-zinc-300">{meal.name}</span>
                        <span className="text-zinc-500"> — {meal.calories.toLocaleString()} cal</span>
                        {meal.macros && (
                          <span className="text-zinc-600">
                            {' '}
                            ({[
                              meal.macros.protein != null ? `${meal.macros.protein}g protein` : null,
                              meal.macros.carbs != null ? `${meal.macros.carbs}g carbs` : null,
                              meal.macros.fat != null ? `${meal.macros.fat}g fat` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-zinc-600 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                  {nutritionEntry.description}
                </p>
                {balance != null && (
                  <div className="pt-1 border-t border-zinc-800">
                    <p className={`text-sm font-mono font-bold ${balance > 0 ? 'text-lime-400' : 'text-amber-400'}`}>
                      {balance > 0 ? 'Deficit' : 'Surplus'}: {Math.abs(Math.round(balance)).toLocaleString()} cal
                    </p>
                  </div>
                )}
              </div>
            )}

            {coachNote && (
              <div className="pt-1 border-t border-zinc-800 space-y-1">
                <p className="text-cyan-500 text-[10px] font-mono tracking-widest uppercase">Coach</p>
                <p className="text-zinc-300 text-xs font-mono leading-relaxed">{coachNote}</p>
              </div>
            )}

            {foodPhotos.length > 0 && (
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <p className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">Food Photos</p>
                <ul className="space-y-1.5">
                  {foodPhotos.map((p) => (
                    <li
                      key={p}
                      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <a href={resolveFoodPhotoHref(p)} target="_blank" rel="noreferrer" className="shrink-0">
                        <div
                          className="h-12 w-12 rounded border border-zinc-700 bg-zinc-800 bg-cover bg-center"
                          style={{ backgroundImage: `url("${resolveFoodPhotoHref(p)}")` }}
                        />
                      </a>
                      <a
                        href={resolveFoodPhotoHref(p)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-400 hover:text-zinc-200 text-xs font-mono truncate"
                      >
                        {p}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {foodNote && (
              <div className="pt-3 border-t border-zinc-800">
                <p className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Note</p>
                <p className="text-zinc-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">{foodNote}</p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => router.push('/')}
          className="w-full h-12 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-[0.15em] uppercase transition-colors"
        >
          Back to Home
        </button>
      </div>
    </main>
  )
}
