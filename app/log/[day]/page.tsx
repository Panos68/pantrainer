'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Session } from '@/lib/schema'
import type { WeekDoc } from '@/lib/schema'

// ─── Lift progression parser ───────────────────────────────────────────────

function buildLiftNotes(lifts: Record<string, string | number | null>): string {
  const lines: string[] = []

  // Extract lift names (keys ending in _kg)
  const liftKeys = Object.keys(lifts).filter((k) => k.endsWith('_kg'))

  for (const kgKey of liftKeys) {
    const liftName = kgKey.replace(/_kg$/, '')
    const weight = lifts[kgKey]
    if (weight == null) continue

    // Check for a status key (e.g. bench_status)
    const statusKey = `${liftName}_status`
    const status = lifts[statusKey]

    // Check for a next key (e.g. deadlift_next)
    const nextKey = `${liftName}_next`
    const next = lifts[nextKey]

    // Check for a note key (e.g. pullups_note)
    const noteKey = `${liftName}_note`
    const note = lifts[noteKey]

    const displayName = liftName.replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    let line = `${displayName}: ${weight}kg`

    if (status && next) {
      line += ` → next: ${next}kg`
    } else if (status === 'ceiling') {
      line += ` (ceiling — hold)`
    } else if (next) {
      line += ` → next: ${next}kg`
    }

    if (note) {
      line += ` (${note})`
    }

    lines.push(line)
  }

  return lines.join('\n')
}

// ─── Type colors ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Strength: 'text-violet-400',
  Conditioning: 'text-sky-400',
  Recovery: 'text-emerald-400',
  Rest: 'text-zinc-500',
}

// ─── Read-only view ──────────────────────────────────────────────────────

function ReadOnlyView({ session }: { session: Session }) {
  const router = useRouter()
  const typeColor = TYPE_COLORS[session.type] ?? 'text-zinc-400'
  const isCompleted = session.status === 'completed'

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl font-black tracking-tight uppercase text-zinc-50">
              {session.day}
            </h1>
          </div>
          <span
            className={`px-3 py-1 rounded-full border text-xs font-mono font-bold tracking-widest uppercase ${
              isCompleted
                ? 'bg-lime-400/10 text-lime-400 border-lime-400/30'
                : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'
            }`}
          >
            {isCompleted ? 'COMPLETED' : 'SKIPPED'}
          </span>
        </header>

        {/* Final banner */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
          <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
            Logged data is final
          </p>
        </div>

        {/* Session details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold tracking-wide uppercase ${typeColor}`}>
              {session.type}
            </span>
            {session.subtype && (
              <span className="text-zinc-500 text-xs font-mono">{session.subtype}</span>
            )}
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

          {session.notes && (
            <div className="pt-3 border-t border-zinc-800">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Notes</div>
              <p className="text-zinc-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {session.notes}
              </p>
            </div>
          )}

          {session.photos.length > 0 && (
            <div className="pt-3 border-t border-zinc-800">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase mb-2">Photos</div>
              <ul className="space-y-1">
                {session.photos.map((p, i) => (
                  <li key={i} className="text-zinc-400 text-xs font-mono">{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Back button */}
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

// ─── Main page ───────────────────────────────────────────────────────────

export default function LogDayPage() {
  const params = useParams()
  const router = useRouter()
  const day = (params.day as string) ?? ''

  const [session, setSession] = useState<Session | null>(null)
  const [week, setWeek] = useState<WeekDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [type, setType] = useState('Strength')
  const [subtype, setSubtype] = useState('')
  const [duration, setDuration] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [calories, setCalories] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [photoInput, setPhotoInput] = useState('')

  // Skip flow state
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  // Saving state
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Load session and week data
  useEffect(() => {
    async function load() {
      try {
        const [sessionRes, weekRes] = await Promise.all([
          fetch(`/api/session/${day}`),
          fetch('/api/week'),
        ])
        if (!sessionRes.ok) throw new Error('Session not found')
        const sessionData: Session = await sessionRes.json()
        const weekData: WeekDoc = await weekRes.json()

        setSession(sessionData)
        setWeek(weekData)

        // Pre-fill form
        setType(sessionData.type)
        setSubtype(sessionData.subtype ?? '')

        // Pre-fill notes for Strength sessions
        if (sessionData.type === 'Strength' && weekData.lift_progression) {
          const liftNotes = buildLiftNotes(weekData.lift_progression)
          setNotes(liftNotes || (sessionData.notes ?? ''))
        } else {
          setNotes(sessionData.notes ?? '')
        }

        setPhotos(sessionData.photos ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [day])

  const buildPayload = useCallback(() => ({
    type,
    subtype: subtype || null,
    duration_min: duration ? Number(duration) : null,
    avg_hr_bpm: avgHr ? Number(avgHr) : null,
    total_calories: calories ? Number(calories) : null,
    notes,
    photos,
  }), [type, subtype, duration, avgHr, calories, notes, photos])

  async function handleSaveProgress() {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), status: 'in_progress' }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveMsg(err.error ?? 'Save failed')
      } else {
        setSaveMsg('Saved!')
        setTimeout(() => setSaveMsg(''), 2000)
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkComplete() {
    setSaving(true)
    try {
      const res = await fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), status: 'completed' }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveMsg(err.error ?? 'Failed to complete session')
        setSaving(false)
      } else {
        router.push('/')
      }
    } catch {
      setSaveMsg('Network error')
      setSaving(false)
    }
  }

  async function handleSkip() {
    setSaving(true)
    try {
      const res = await fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped', notes: skipReason }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveMsg(err.error ?? 'Failed to skip session')
        setSaving(false)
      } else {
        router.push('/')
      }
    } catch {
      setSaveMsg('Network error')
      setSaving(false)
    }
  }

  function addPhoto() {
    const trimmed = photoInput.trim()
    if (trimmed) {
      setPhotos((prev) => [...prev, trimmed])
      setPhotoInput('')
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500 text-xs font-mono tracking-widest uppercase animate-pulse">
          Loading...
        </div>
      </main>
    )
  }

  if (error || !session) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-zinc-400 text-sm">{error ?? 'Session not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 h-10 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-widest uppercase transition-colors"
          >
            Back to Home
          </button>
        </div>
      </main>
    )
  }

  // Read-only view for finalized sessions
  if (session.status === 'completed' || session.status === 'skipped') {
    return <ReadOnlyView session={session} />
  }

  const typeColor = TYPE_COLORS[type] ?? 'text-zinc-400'
  const isConditioning = type === 'Conditioning'

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-3xl font-black tracking-tight uppercase text-zinc-50">
              {session.day}
            </h1>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-zinc-500 hover:text-zinc-300 text-xs font-mono tracking-widest uppercase transition-colors"
          >
            ← Home
          </button>
        </header>

        {/* Coach guidance banner */}
        {session.subtype && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-1.5">
              Coach Notes
            </p>
            <p className="text-zinc-300 text-sm font-mono leading-relaxed">
              {session.subtype}
            </p>
          </div>
        )}

        {/* Status badge */}
        {session.status === 'in_progress' && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-400 text-xs font-mono font-bold tracking-widest uppercase">
              In Progress
            </span>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="space-y-5"
        >
          {/* Session Type */}
          <div className="space-y-1.5">
            <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
              Session Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 font-bold text-sm tracking-wide uppercase focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/20 transition-colors"
            >
              <option value="Strength">Strength</option>
              <option value="Conditioning">Conditioning</option>
              <option value="Recovery">Recovery</option>
              <option value="Rest">Rest</option>
            </select>
            <div className={`text-xs font-bold tracking-wide uppercase ${typeColor}`}>{type}</div>
          </div>

          {/* Subtype */}
          <div className="space-y-1.5">
            <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
              Subtype / Description
            </label>
            <input
              type="text"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              placeholder="e.g. Push day, Zone 2 run..."
              className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/20 transition-colors"
            />
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Duration
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/20 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px] font-mono">
                  MIN
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Avg HR
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={avgHr}
                  onChange={(e) => setAvgHr(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/20 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px] font-mono">
                  BPM
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Calories
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px] font-mono">
                  KCAL
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              placeholder="Session notes..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-lime-400/50 focus:ring-1 focus:ring-lime-400/20 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Photos — Conditioning only */}
          {isConditioning && (
            <div className="space-y-2">
              <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Photos
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={photoInput}
                  onChange={(e) => setPhotoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addPhoto()
                    }
                  }}
                  placeholder="File path or URL..."
                  className="flex-1 h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={addPhoto}
                  className="h-11 px-4 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs tracking-widest uppercase transition-colors"
                >
                  Add
                </button>
              </div>
              {photos.length > 0 && (
                <ul className="space-y-1.5 mt-2">
                  {photos.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <span className="text-zinc-400 text-xs font-mono truncate">{p}</span>
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="text-zinc-600 hover:text-red-400 text-xs font-mono transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>

        {/* Save message */}
        {saveMsg && (
          <p className={`text-xs font-mono tracking-widest text-center ${
            saveMsg === 'Saved!' ? 'text-lime-400' : 'text-red-400'
          }`}>
            {saveMsg}
          </p>
        )}

        {/* Skip flow */}
        {showSkip && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
            <p className="text-zinc-400 text-xs font-mono tracking-widest uppercase">
              Reason for skipping (optional)
            </p>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              rows={3}
              placeholder="e.g. Travel, injury, recovery day..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-bold text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
              >
                {saving ? 'Skipping...' : 'Confirm Skip'}
              </button>
              <button
                onClick={() => setShowSkip(false)}
                className="px-5 h-11 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold text-xs tracking-widest uppercase transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!showSkip && (
          <div className="grid grid-cols-1 gap-3 pt-2">
            <button
              onClick={handleMarkComplete}
              disabled={saving}
              className="w-full h-14 rounded-xl bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Mark Complete'}
            </button>
            <button
              onClick={handleSaveProgress}
              disabled={saving}
              className="w-full h-12 rounded-xl border border-zinc-600 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
            <button
              onClick={() => setShowSkip(true)}
              disabled={saving}
              className="w-full h-11 rounded-xl border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-600 hover:text-zinc-400 font-bold text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
            >
              Skip Session
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
