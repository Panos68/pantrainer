'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Session, GarminRecoveryDay } from '@/lib/schema'
import GarminRecoveryCard from '@/components/GarminRecoveryCard'
import MuscleMap from '@/components/MuscleMap'

// ─── Type colors ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Strength: 'text-violet-400',
  Conditioning: 'text-sky-400',
  Recovery: 'text-emerald-400',
  Rest: 'text-zinc-500',
}

function GarminBadge() {
  return (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-lime-400/10 text-lime-400 border border-lime-400/20">
      Garmin
    </span>
  )
}

type GarminSyncResponse = {
  matched: boolean
  duration_min?: number
  avg_hr_bpm?: number
  total_calories?: number
  garmin_activity_id?: number
  aerobic_training_effect?: number | null
  anaerobic_training_effect?: number | null
  training_stress_score?: number | null
  hr_zones?: Array<{ zone_name: string; secs_in_zone: number; zone_high_boundary: number }> | null
  distance_m?: number | null
  avg_speed_mps?: number | null
}

function isPreviewablePhotoUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
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
                  <li key={i} className="flex items-center gap-3">
                    {isPreviewablePhotoUrl(p) && (
                      <a href={p} target="_blank" rel="noreferrer" className="shrink-0">
                        <div
                          className="h-12 w-12 rounded border border-zinc-700 bg-zinc-800 bg-cover bg-center"
                          style={{ backgroundImage: `url("${p}")` }}
                        />
                      </a>
                    )}
                    <a
                      href={p}
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
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [photoUploadMsg, setPhotoUploadMsg] = useState<string | null>(null)

  // Session import state
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Exercise actuals state (indexed to match session.exercises)
  type ExerciseActual = { sets: string; reps: string; weight_kg: string }
  const [exerciseActuals, setExerciseActuals] = useState<ExerciseActual[]>([])
  const [swappedExercises, setSwappedExercises] = useState<Record<number, number>>({}) // index → alt index
  const [openSwapMenu, setOpenSwapMenu] = useState<number | null>(null)

  // Skip flow state
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  // Saving state
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Garmin auto-fill state
  const [garminSynced, setGarminSynced] = useState<{
    duration?: boolean
    avg_hr?: boolean
    calories?: boolean
    activity_id?: number
  }>({})
  const [garminRecovery, setGarminRecovery] = useState<GarminRecoveryDay | null>(null)
  const [garminTraining, setGarminTraining] = useState<{
    aerobic_training_effect?: number | null
    anaerobic_training_effect?: number | null
    training_stress_score?: number | null
    hr_zones?: Array<{ zone_name: string; secs_in_zone: number; zone_high_boundary: number }> | null
  }>({})
  const [refreshingGarmin, setRefreshingGarmin] = useState(false)

  const refreshFromGarmin = useCallback(async (
    targetSession: Pick<Session, 'date' | 'type'>,
    overwriteMetrics = false,
  ) => {
    const syncUrl = `/api/garmin/sync?date=${targetSession.date}&type=${encodeURIComponent(targetSession.type)}`
    const [syncResult, recoveryResult] = await Promise.allSettled([
      fetch(syncUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/garmin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetSession.date }),
      }).then((r) => (r.ok ? r.json() : null)),
    ])

    let matchedSync: GarminSyncResponse | null = null
    if (syncResult.status === 'fulfilled' && syncResult.value?.matched) {
      const sync = syncResult.value as GarminSyncResponse
      matchedSync = sync
      const synced: typeof garminSynced = { activity_id: sync.garmin_activity_id }

      if (sync.duration_min != null) {
        setDuration((prev) => (overwriteMetrics || !prev ? String(sync.duration_min) : prev))
        synced.duration = true
      }
      if (sync.avg_hr_bpm != null) {
        setAvgHr((prev) => (overwriteMetrics || !prev ? String(sync.avg_hr_bpm) : prev))
        synced.avg_hr = true
      }
      if (sync.total_calories != null) {
        setCalories((prev) => (overwriteMetrics || !prev ? String(sync.total_calories) : prev))
        synced.calories = true
      }
      if (sync.distance_m && sync.distance_m > 0) {
        const km = (sync.distance_m / 1000).toFixed(2)
        let paceStr = ''
        if (sync.avg_speed_mps && sync.avg_speed_mps > 0) {
          const paceSecPerKm = 1000 / sync.avg_speed_mps
          const paceMin = Math.floor(paceSecPerKm / 60)
          const paceSec = Math.round(paceSecPerKm % 60).toString().padStart(2, '0')
          paceStr = ` @ ${paceMin}:${paceSec}/km`
        }
        const distanceLine = `Distance: ${km}km${paceStr}`
        setNotes((prev) => prev?.includes(distanceLine) ? prev : (prev ? `${prev}\n${distanceLine}` : distanceLine))
      }

      setGarminSynced(synced)
      setGarminTraining({
        aerobic_training_effect: sync.aerobic_training_effect,
        anaerobic_training_effect: sync.anaerobic_training_effect,
        training_stress_score: sync.training_stress_score,
        hr_zones: sync.hr_zones,
      })
    }

    if (recoveryResult.status === 'fulfilled' && recoveryResult.value?.recovery) {
      setGarminRecovery(recoveryResult.value.recovery as GarminRecoveryDay)
    }

    return matchedSync
  }, [])

  // Load session and week data
  useEffect(() => {
    async function load() {
      try {
        const sessionRes = await fetch(`/api/session/${day}`)
        if (!sessionRes.ok) throw new Error('Session not found')
        const sessionData: Session = await sessionRes.json()

        setSession(sessionData)

        // Pre-fill form
        setType(sessionData.type)
        setSubtype(sessionData.subtype ?? '')
        setNotes(sessionData.notes ?? '')
        setPhotos(sessionData.photos ?? [])
        if (sessionData.duration_min != null) setDuration(String(sessionData.duration_min))
        if (sessionData.avg_hr_bpm != null) setAvgHr(String(sessionData.avg_hr_bpm))
        if (sessionData.total_calories != null) setCalories(String(sessionData.total_calories))
        if (sessionData.aerobic_training_effect != null || sessionData.hr_zones != null) {
          setGarminTraining({
            aerobic_training_effect: sessionData.aerobic_training_effect,
            anaerobic_training_effect: sessionData.anaerobic_training_effect,
            training_stress_score: sessionData.training_stress_score,
            hr_zones: sessionData.hr_zones,
          })
        }

        // Initialize exercise actuals from planned values (or existing actuals if in_progress)
        setExerciseActuals(
          (sessionData.exercises ?? []).map((ex) => ({
            sets: ex.actual_sets?.toString() ?? ex.sets?.toString() ?? '',
            reps:
              ex.actual_reps?.toString() ??
              (typeof ex.reps === 'number' ? ex.reps.toString() : ex.reps ?? ''),
            weight_kg:
              ex.actual_weight_kg != null
                ? ex.actual_weight_kg.toString()
                : ex.weight_kg != null
                ? ex.weight_kg.toString()
                : '',
            }))
        )

        if (sessionData.status !== 'completed' && sessionData.status !== 'skipped') {
          void refreshFromGarmin({ date: sessionData.date, type: sessionData.type }, false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [day, refreshFromGarmin])

  const buildPayload = useCallback(() => {
    const exercises =
      type === 'Strength'
        ? (session?.exercises ?? []).map((ex, i) => {
            const actual = exerciseActuals[i]
            const altIndex = swappedExercises[i]
            const alt = altIndex != null ? ex.alternatives[altIndex] : null
            return {
              ...ex,
              name: alt?.name ?? ex.name,
              sets: alt?.sets ?? ex.sets,
              reps: alt?.reps ?? ex.reps,
              weight_kg: alt?.weight_kg ?? ex.weight_kg,
              actual_sets: actual?.sets !== '' ? Number(actual?.sets) : undefined,
              actual_reps:
                actual?.reps !== ''
                  ? isNaN(Number(actual?.reps))
                    ? actual?.reps
                    : Number(actual?.reps)
                  : undefined,
              actual_weight_kg:
                actual?.weight_kg !== '' ? Number(actual?.weight_kg) : undefined,
            }
          })
        : session?.exercises ?? []

    return {
      type,
      subtype: subtype || null,
      duration_min: duration ? Number(duration) : null,
      avg_hr_bpm: avgHr ? Number(avgHr) : null,
      total_calories: calories ? Number(calories) : null,
      notes,
      photos,
      exercises,
      garmin_activity_id: garminSynced.activity_id ?? null,
      source: (garminSynced.duration || garminSynced.avg_hr || garminSynced.calories) ? 'garmin' as const : 'manual' as const,
      aerobic_training_effect: garminTraining.aerobic_training_effect ?? null,
      anaerobic_training_effect: garminTraining.anaerobic_training_effect ?? null,
      training_stress_score: garminTraining.training_stress_score ?? null,
      hr_zones: garminTraining.hr_zones ?? null,
    }
  }, [type, subtype, duration, avgHr, calories, notes, photos, exerciseActuals, session, swappedExercises, garminSynced, garminTraining])

  const mergeGarminIntoPayload = useCallback((
    payload: ReturnType<typeof buildPayload>,
    sync: GarminSyncResponse | null,
  ) => {
    if (!sync?.matched) return payload

    const usedGarminMetric =
      (payload.duration_min == null && sync.duration_min != null) ||
      (payload.avg_hr_bpm == null && sync.avg_hr_bpm != null) ||
      (payload.total_calories == null && sync.total_calories != null)

    return {
      ...payload,
      garmin_activity_id: sync.garmin_activity_id ?? payload.garmin_activity_id ?? null,
      duration_min: payload.duration_min ?? sync.duration_min ?? null,
      avg_hr_bpm: payload.avg_hr_bpm ?? sync.avg_hr_bpm ?? null,
      total_calories: payload.total_calories ?? sync.total_calories ?? null,
      source: payload.source === 'garmin' || usedGarminMetric ? 'garmin' as const : 'manual' as const,
      aerobic_training_effect: payload.aerobic_training_effect ?? sync.aerobic_training_effect ?? null,
      anaerobic_training_effect: payload.anaerobic_training_effect ?? sync.anaerobic_training_effect ?? null,
      training_stress_score: payload.training_stress_score ?? sync.training_stress_score ?? null,
      hr_zones: payload.hr_zones ?? sync.hr_zones ?? null,
    }
  }, [])

  async function handleSaveProgress() {
    setSaving(true)
    setSaveMsg('')
    try {
      const sync = session ? await refreshFromGarmin({ date: session.date, type: session.type }, false) : null
      const payload = mergeGarminIntoPayload(buildPayload(), sync)
      const res = await fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'in_progress' }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveMsg(err.error ?? 'Save failed')
      } else {
        const updated = await res.json() as Session
        setSession(updated)
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
      const sync = session ? await refreshFromGarmin({ date: session.date, type: session.type }, false) : null
      const payload = mergeGarminIntoPayload(buildPayload(), sync)
      const res = await fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'completed' }),
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

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  async function handlePhotoFilesUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0 || !session) return

    setUploadingPhotos(true)
    setPhotoUploadMsg(null)
    try {
      const uploadedUrls: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.set('file', file)
        formData.set('date', session.date)
        const res = await fetch('/api/photos', {
          method: 'POST',
          body: formData,
        })
        const raw = await res.text()
        let data: { url?: string; error?: string } = {}
        if (raw.trim().length > 0) {
          try {
            data = JSON.parse(raw) as { url?: string; error?: string }
          } catch {
            throw new Error(`Upload failed for ${file.name} (${res.status})`)
          }
        }
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? `Upload failed for ${file.name} (${res.status})`)
        }
        uploadedUrls.push(data.url as string)
      }

      setPhotos((prev) => [...prev, ...uploadedUrls])
      setPhotoUploadMsg(`Uploaded ${uploadedUrls.length} photo${uploadedUrls.length > 1 ? 's' : ''}`)
      setTimeout(() => setPhotoUploadMsg(null), 2500)
    } catch (error) {
      setPhotoUploadMsg(error instanceof Error ? error.message : 'Photo upload failed')
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleRefreshGarmin() {
    setRefreshingGarmin(true)
    setSaveMsg('')
    try {
      const sync = session ? await refreshFromGarmin({ date: session.date, type: session.type }, true) : null
      if (sync?.matched) {
        setSaveMsg('Garmin data refreshed')
        setTimeout(() => setSaveMsg(''), 2000)
      } else {
        setSaveMsg('No Garmin activity found yet')
      }
    } catch {
      setSaveMsg('Garmin refresh failed')
    } finally {
      setRefreshingGarmin(false)
    }
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

  async function handleSessionImport() {
    if (!importJson.trim()) return
    try {
      const res = await fetch('/api/session/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: importJson }),
      })
      const data = await res.json()
      if (!data.ok) {
        setImportMsg({ ok: false, text: data.errors?.join(', ') ?? 'Import failed' })
      } else {
        setSession(data.session)
        setType(data.session.type)
        setSubtype(data.session.subtype ?? '')
        setNotes(data.session.notes ?? '')
        setImportJson('')
        setShowImport(false)
        setImportMsg({ ok: true, text: 'Session updated' })
        setTimeout(() => setImportMsg(null), 2500)
      }
    } catch {
      setImportMsg({ ok: false, text: 'Network error' })
    }
  }

  // Read-only view for finalized sessions
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

        {/* Muscle map */}
        <MuscleMap muscles={session.muscle_groups ?? []} />

        {/* Exercise table — structured for Strength, read-only list for others */}
        {type === 'Strength' && session.exercises && session.exercises.length > 0 && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
              Exercises — Planned → Actual
            </p>
            <div className="rounded-xl border border-zinc-800 overflow-visible">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(6,2rem)] sm:grid-cols-[minmax(0,1fr)_repeat(6,2.75rem)] bg-zinc-900 border-b border-zinc-800">
                <div className="px-3 py-2 text-zinc-600 text-[10px] font-mono uppercase tracking-widest">Exercise</div>
                <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">S</div>
                <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">R</div>
                <div className="py-2 text-zinc-600 text-[10px] font-mono text-center">kg</div>
                <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">S</div>
                <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">R</div>
                <div className="py-2 text-violet-400/60 text-[10px] font-mono text-center">kg</div>
              </div>
              {session.exercises.map((ex, i) => {
                const openUp = i >= session.exercises.length - 2
                return (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(6,2rem)] sm:grid-cols-[minmax(0,1fr)_repeat(6,2.75rem)] border-b border-zinc-800/60 last:border-0 relative"
                >
                  <div className="bg-zinc-950 px-3 py-2.5 text-zinc-300 text-xs font-mono font-bold relative min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`truncate ${swappedExercises[i] != null ? 'text-amber-400' : ''}`}>
                        {swappedExercises[i] != null
                          ? ex.alternatives[swappedExercises[i]]?.name ?? ex.name
                          : ex.name}
                      </span>
                      {ex.alternatives && ex.alternatives.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenSwapMenu(openSwapMenu === i ? null : i)}
                          className="shrink-0 text-zinc-600 hover:text-amber-400 transition-colors text-[10px]"
                          title="Swap exercise"
                        >
                          ⇄
                        </button>
                      )}
                    </div>
                    {ex.notes && (
                      <span className="block text-zinc-600 text-[10px] font-normal mt-0.5 line-clamp-2">{ex.notes}</span>
                    )}
                    {openSwapMenu === i && (
                      <div className={`absolute left-0 z-20 w-56 max-h-56 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        <div className="px-3 py-2 text-zinc-500 text-[9px] font-mono tracking-widest uppercase border-b border-zinc-800">
                          Swap with
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSwappedExercises((prev) => { const n = { ...prev }; delete n[i]; return n })
                            setOpenSwapMenu(null)
                          }}
                          className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-zinc-800 transition-colors ${swappedExercises[i] == null ? 'text-lime-400' : 'text-zinc-400'}`}
                        >
                          {ex.name} {swappedExercises[i] == null ? '✓' : ''}
                        </button>
                        {ex.alternatives.map((alt, ai) => (
                          <button
                            key={ai}
                            type="button"
                            onClick={() => {
                              setSwappedExercises((prev) => ({ ...prev, [i]: ai }))
                              setExerciseActuals((prev) => prev.map((a, j) =>
                                j === i ? {
                                  sets: alt.sets?.toString() ?? a.sets,
                                  reps: alt.reps?.toString() ?? a.reps,
                                  weight_kg: alt.weight_kg?.toString() ?? '',
                                } : a
                              ))
                              setOpenSwapMenu(null)
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-zinc-800 transition-colors border-t border-zinc-800/60 ${swappedExercises[i] === ai ? 'text-amber-400' : 'text-zinc-400'}`}
                          >
                            {alt.name}
                            {alt.notes && <span className="block text-zinc-600 text-[10px]">{alt.notes}</span>}
                            {swappedExercises[i] === ai && ' ✓'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">{ex.sets ?? '—'}</div>
                  <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">{ex.reps ?? '—'}</div>
                  <div className="bg-zinc-950 py-2.5 text-zinc-500 text-xs font-mono text-center">
                    {ex.weight_kg != null ? ex.weight_kg : '—'}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={exerciseActuals[i]?.sets ?? ''}
                    onChange={(e) =>
                      setExerciseActuals((prev) =>
                        prev.map((a, j) => (j === i ? { ...a, sets: e.target.value } : a))
                      )
                    }
                    className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
                    placeholder="—"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={exerciseActuals[i]?.reps ?? ''}
                    onChange={(e) =>
                      setExerciseActuals((prev) =>
                        prev.map((a, j) => (j === i ? { ...a, reps: e.target.value } : a))
                      )
                    }
                    className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
                    placeholder="—"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={exerciseActuals[i]?.weight_kg ?? ''}
                    onChange={(e) =>
                      setExerciseActuals((prev) =>
                        prev.map((a, j) => (j === i ? { ...a, weight_kg: e.target.value } : a))
                      )
                    }
                    className="bg-zinc-900 py-2.5 text-violet-400 text-xs font-mono text-center focus:outline-none focus:bg-zinc-800 w-full"
                    placeholder="—"
                  />
                </div>
              )})}
            </div>
            <p className="text-zinc-600 text-[10px] font-mono">
              Violet = actual. Pre-filled from plan — edit what changed.
            </p>
          </div>
        )}

        {type !== 'Strength' && session.exercises && session.exercises.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-2">
              Planned
            </p>
            <ul className="space-y-1.5">
              {session.exercises.map((ex, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm font-mono">
                  <span className="text-zinc-300 font-bold">{ex.name}</span>
                  {ex.sets != null && ex.reps != null && (
                    <span className="text-zinc-500">{ex.sets}×{ex.reps}</span>
                  )}
                  {ex.weight_kg != null && (
                    <span className="text-violet-400">@ {ex.weight_kg}kg</span>
                  )}
                  {ex.notes && <span className="text-zinc-600 text-xs">— {ex.notes}</span>}
                </li>
              ))}
            </ul>
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

        {/* Recovery card */}
        <GarminRecoveryCard
          date={session.date}
          recovery={garminRecovery}
          onFetched={(data) => setGarminRecovery(data)}
        />

        <button
          type="button"
          onClick={handleRefreshGarmin}
          disabled={refreshingGarmin || saving}
          className="w-full h-10 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
        >
          {refreshingGarmin ? 'Refreshing Garmin...' : 'Refresh Garmin Data'}
        </button>

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
                Duration{garminSynced.duration && <GarminBadge />}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => { setDuration(e.target.value); setGarminSynced((s) => ({ ...s, duration: false })) }}
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
                Avg HR{garminSynced.avg_hr && <GarminBadge />}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={avgHr}
                  onChange={(e) => { setAvgHr(e.target.value); setGarminSynced((s) => ({ ...s, avg_hr: false })) }}
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
                Calories{garminSynced.calories && <GarminBadge />}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => { setCalories(e.target.value); setGarminSynced((s) => ({ ...s, calories: false })) }}
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

          {/* Photos */}
          {(
            <div className="space-y-2">
              <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Photos
              </label>
              <div className="flex gap-2">
                <label className="flex-1 h-11 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-sm flex items-center px-4 cursor-pointer transition-colors">
                  <span className="text-zinc-600 mr-2">+</span> Pick file…
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handlePhotoFilesUpload(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {photoUploadMsg && (
                <p className={`text-[10px] font-mono ${photoUploadMsg.startsWith('Uploaded') ? 'text-lime-400' : 'text-red-400'}`}>
                  {photoUploadMsg}
                </p>
              )}
              {uploadingPhotos && (
                <p className="text-zinc-500 text-[10px] font-mono">
                  Uploading photos...
                </p>
              )}
              {photos.length > 0 && (
                <ul className="space-y-1.5 mt-2">
                  {photos.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isPreviewablePhotoUrl(p) && (
                          <a href={p} target="_blank" rel="noreferrer" className="shrink-0">
                            <div
                              className="h-12 w-12 rounded border border-zinc-700 bg-zinc-800 bg-cover bg-center"
                              style={{ backgroundImage: `url("${p}")` }}
                            />
                          </a>
                        )}
                        <a
                          href={p}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-400 hover:text-zinc-200 text-xs font-mono truncate"
                        >
                          {p}
                        </a>
                      </div>
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

        {/* Session import */}
        {showImport && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
            <p className="text-zinc-400 text-xs font-mono tracking-widest uppercase">
              Paste updated session JSON
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={6}
              placeholder={'{\n  "day": "Wednesday",\n  "type": "Strength",\n  "exercises": [...]\n}'}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-lime-400/50 resize-none leading-relaxed"
            />
            {importMsg && (
              <p className={`text-xs font-mono ${importMsg.ok ? 'text-lime-400' : 'text-red-400'}`}>
                {importMsg.text}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSessionImport}
                className="flex-1 h-11 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-black text-xs tracking-[0.15em] uppercase transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => { setShowImport(false); setImportJson(''); setImportMsg(null) }}
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
            {session.status === 'completed' || session.status === 'skipped' ? (
              <button
                onClick={handleMarkComplete}
                disabled={saving}
                className="w-full h-14 rounded-xl bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            ) : (
              <>
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
              </>
            )}
            {session.status !== 'completed' && session.status !== 'skipped' && (
              <button
                onClick={() => setShowImport(!showImport)}
                className="w-full h-10 rounded-xl border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-600 hover:text-zinc-400 font-bold text-xs tracking-[0.15em] uppercase transition-colors"
              >
                Update from JSON
              </button>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
