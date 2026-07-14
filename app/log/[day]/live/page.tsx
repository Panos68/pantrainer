'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import RestTimer from '@/components/RestTimer'
import { buildLiveQueue, type LiveStep } from '@/lib/liveSession'
import type { Session, SetEntry } from '@/lib/schema'

function resumeIndex(queue: LiveStep[], loggedSets: Record<number, SetEntry[]>): number {
  const firstIncomplete = queue.findIndex(
    (s) => s.kind === 'set' && (loggedSets[s.exerciseIndex]?.length ?? 0) < s.setNumber,
  )
  return firstIncomplete === -1 ? 0 : firstIncomplete
}

function SetEntryForm({
  step,
  saving,
  canSwap,
  onLog,
}: {
  step: Extract<LiveStep, { kind: 'set' }>
  saving: boolean
  canSwap: boolean
  onLog: (reps: string, weight: string, effort: SetEntry['effort']) => void
}) {
  const [altIndex, setAltIndex] = useState<number | null>(null)
  const activeExercise =
    altIndex != null
      ? {
          ...step.exercise,
          name: step.exercise.alternatives[altIndex].name,
          reps: step.exercise.alternatives[altIndex].reps ?? step.exercise.reps,
          weight_kg: step.exercise.alternatives[altIndex].weight_kg ?? step.exercise.weight_kg,
        }
      : step.exercise
  const [reps, setReps] = useState(activeExercise.reps != null ? String(activeExercise.reps) : '')
  const [weight, setWeight] = useState(activeExercise.weight_kg != null ? String(activeExercise.weight_kg) : '')
  const roundLabel = step.roundNumber != null ? `Round ${step.roundNumber} of ${step.totalRounds}` : null

  function handleSwap(v: number) {
    setAltIndex(v === -1 ? null : v)
    const alt = v === -1 ? null : step.exercise.alternatives[v]
    const nextReps = alt?.reps ?? step.exercise.reps
    const nextWeight = alt?.weight_kg ?? step.exercise.weight_kg
    setReps(nextReps != null ? String(nextReps) : '')
    setWeight(nextWeight != null ? String(nextWeight) : '')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
      {roundLabel && <div className="text-xs text-zinc-500 font-mono">{roundLabel}</div>}
      <div className="text-2xl font-mono">{activeExercise.name}</div>
      <div className="text-sm text-zinc-500 font-mono">
        Set {step.setNumber} of {step.totalSets}
      </div>
      {canSwap && step.exercise.alternatives.length > 0 && (
        <select
          value={altIndex ?? -1}
          onChange={(e) => handleSwap(Number(e.target.value))}
          className="px-3 py-2 rounded bg-zinc-900 text-zinc-200 text-sm font-mono"
        >
          <option value={-1}>{step.exercise.name}</option>
          {step.exercise.alternatives.map((alt, ai) => (
            <option key={ai} value={ai}>{alt.name}</option>
          ))}
        </select>
      )}
      <div className="flex gap-3">
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          className="w-20 px-3 py-2 rounded bg-zinc-900 text-center font-mono"
        />
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="w-20 px-3 py-2 rounded bg-zinc-900 text-center font-mono"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => onLog(reps, weight, 'easy')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Easy
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onLog(reps, weight, 'perfect')}
          className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-semibold font-mono"
        >
          Perfect
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onLog(reps, weight, 'hard')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Hard
        </button>
      </div>
    </div>
  )
}

export default function LiveSessionPage() {
  const params = useParams()
  const day = (params.day as string) ?? ''
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [loggedSets, setLoggedSets] = useState<Record<number, SetEntry[]>>({})
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingNoteExerciseIndex, setPendingNoteExerciseIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!day) return
    fetch(`/api/session/${day}`)
      .then((r) => r.json())
      .then((data: Session) => {
        const initial: Record<number, SetEntry[]> = {}
        data.exercises.forEach((ex, i) => {
          if (ex.set_log && ex.set_log.length > 0) initial[i] = ex.set_log
        })
        const queue = buildLiveQueue(data)
        setSession(data)
        setLoggedSets(initial)
        setStepIndex(resumeIndex(queue, initial))
      })
  }, [day])

  const queue = useMemo<LiveStep[]>(() => (session ? buildLiveQueue(session) : []), [session])
  const step = stepIndex != null ? queue[stepIndex] ?? null : null

  async function persist(exerciseIndex: number, updates: Partial<Session['exercises'][number]>) {
    if (!session) return
    setSaving(true)
    const nextExercises = session.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, ...updates } : ex,
    )
    setSession({ ...session, exercises: nextExercises })
    await fetch(`/api/session/${day}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises: nextExercises }),
    })
    setSaving(false)
  }

  function logCurrentSet(reps: string, weight: string, effort: SetEntry['effort']) {
    if (stepIndex == null || !step || step.kind !== 'set') return
    const entry: SetEntry = {
      reps: Number(reps) || 0,
      weight_kg: weight ? Number(weight) : null,
      effort,
      completed_at: new Date().toISOString(),
    }
    const nextSets = [...(loggedSets[step.exerciseIndex] ?? []), entry]
    setLoggedSets((prev) => ({ ...prev, [step.exerciseIndex]: nextSets }))
    persist(step.exerciseIndex, { set_log: nextSets })

    const nextQueueStep = queue[stepIndex + 1]
    const exerciseFinishes =
      !nextQueueStep || nextQueueStep.kind !== 'set' || nextQueueStep.exerciseIndex !== step.exerciseIndex
    if (exerciseFinishes) {
      setNote(step.exercise.actual_note ?? '')
      setPendingNoteExerciseIndex(step.exerciseIndex)
    } else {
      setStepIndex(stepIndex + 1)
    }
  }

  function saveNoteAndAdvance() {
    if (pendingNoteExerciseIndex == null || stepIndex == null) return
    persist(pendingNoteExerciseIndex, { actual_note: note })
    setPendingNoteExerciseIndex(null)
    setStepIndex(stepIndex + 1)
  }

  if (!session || stepIndex == null) return <div className="p-6 text-zinc-400 font-mono">Loading…</div>

  if (pendingNoteExerciseIndex != null) {
    const ex = session.exercises[pendingNoteExerciseIndex]
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
        <div className="text-2xl font-mono">{ex.name}</div>
        <div className="text-sm text-zinc-500 font-mono">All sets logged</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for this exercise…"
          className="w-full max-w-sm px-3 py-2 rounded bg-zinc-900 text-zinc-200 text-sm font-mono"
          rows={3}
        />
        <button
          type="button"
          disabled={saving}
          onClick={saveNoteAndAdvance}
          className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-semibold font-mono"
        >
          Next
        </button>
      </div>
    )
  }

  if (!step) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-950">
        <div className="text-lime-400 font-mono">Session complete.</div>
        <button
          type="button"
          onClick={() => router.push(`/log/${day}`)}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Back to log
        </button>
      </div>
    )
  }

  if (step.kind === 'rest') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950">
        <RestTimer
          key={stepIndex}
          seconds={step.seconds}
          onDone={() => setStepIndex(stepIndex + 1)}
          onSkip={() => setStepIndex(stepIndex + 1)}
          onAddSeconds={() => {}}
        />
      </div>
    )
  }

  const canSwap = (loggedSets[step.exerciseIndex]?.length ?? 0) === 0
  return <SetEntryForm key={stepIndex} step={step} saving={saving} canSwap={canSwap} onLog={logCurrentSet} />
}
