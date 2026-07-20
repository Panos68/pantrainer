'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import RestTimer from '@/components/RestTimer'
import ExerciseTimer from '@/components/ExerciseTimer'
import ExerciseDemo from '@/components/ExerciseDemo'
import {
  buildLiveQueue,
  deriveExerciseAggregates,
  getCarryForwardDefaults,
  getResumeIndex,
  parseTimedSeconds,
  type LiveStep,
} from '@/lib/liveSession'
import { useGarminSync } from '@/lib/useGarminSync'
import { requestNotificationPermission } from '@/lib/notify'
import type { Session, SetEntry } from '@/lib/schema'

function sideLabel(side?: 'left' | 'right'): string {
  if (side === 'left') return 'Left'
  if (side === 'right') return 'Right'
  return ''
}

// Persistent header shown across every render state of the live page — lets the
// athlete peek at the full day plan without losing progress. Safe to navigate
// away and back because every set is persisted immediately via persist().
function LiveHeader({ day }: { day: string }) {
  return (
    <div className="w-full max-w-sm flex items-center justify-between px-1 pb-4">
      <Link href={`/log/${day}`} className="text-zinc-500 hover:text-zinc-300 text-xs font-mono tracking-widest uppercase transition-colors">
        ← Day
      </Link>
      <span className="text-zinc-700 text-xs font-mono">{day}</span>
    </div>
  )
}

function SetEntryForm({
  day,
  step,
  saving,
  canSwap,
  carryForward,
  isLastSet,
  initialNote,
  onLog,
}: {
  day: string
  step: Extract<LiveStep, { kind: 'set' }>
  saving: boolean
  canSwap: boolean
  carryForward: { reps: string; weight_kg: string }
  isLastSet: boolean
  initialNote: string
  onLog: (reps: string, weight: string, effort: SetEntry['effort'], note: string | undefined) => void
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
  const timedSeconds = parseTimedSeconds(activeExercise.reps)
  const [reps, setReps] = useState(
    timedSeconds != null ? String(timedSeconds) : carryForward.reps,
  )
  const [weight, setWeight] = useState(carryForward.weight_kg)
  const roundLabel = step.roundNumber != null ? `Round ${step.roundNumber} of ${step.totalRounds}` : null
  const sideText = sideLabel(step.side)

  const [noteOpen, setNoteOpen] = useState(initialNote.trim().length > 0)
  const [note, setNote] = useState(initialNote)

  function handleSwap(v: number) {
    setAltIndex(v === -1 ? null : v)
    const alt = v === -1 ? null : step.exercise.alternatives[v]
    const nextReps = alt?.reps ?? step.exercise.reps
    const nextWeight = alt?.weight_kg ?? step.exercise.weight_kg
    const nextTimedSeconds = parseTimedSeconds(nextReps)
    setReps(nextTimedSeconds != null ? String(nextTimedSeconds) : nextReps != null ? String(nextReps) : '')
    setWeight(nextWeight != null ? String(nextWeight) : '')
  }

  function handleLog(effort: SetEntry['effort']) {
    onLog(reps, weight, effort, isLastSet ? note : undefined)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
      <LiveHeader day={day} />
      {roundLabel && <div className="text-xs text-zinc-500 font-mono">{roundLabel}</div>}
      <div className="text-2xl font-mono">{activeExercise.name}</div>
      <ExerciseDemo key={activeExercise.name} name={activeExercise.name} inline />
      {step.exercise.notes && (
        <div className="max-w-sm text-center text-xs text-zinc-500 font-mono leading-relaxed">
          {step.exercise.notes}
        </div>
      )}
      <div className="text-sm text-zinc-500 font-mono">
        Set {step.setNumber} of {step.totalSets}
        {sideText && ` — ${sideText}`}
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
      {timedSeconds != null ? (
        <ExerciseTimer
          key={`${step.setNumber}-${altIndex}`}
          seconds={timedSeconds}
          onSkip={() => setReps(String(timedSeconds))}
        />
      ) : (
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
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => handleLog('easy')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Easy
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleLog('perfect')}
          className="px-4 py-2 rounded bg-lime-600 text-black text-sm font-semibold font-mono"
        >
          Perfect
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleLog('hard')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Hard
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleLog(null)}
          className="px-4 py-2 rounded bg-zinc-900 text-zinc-500 text-sm font-mono"
          title="Skip rating this exercise (e.g. stretching)"
        >
          Skip
        </button>
      </div>
      {isLastSet && (
        <div className="w-full max-w-xs">
          {noteOpen ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for this exercise…"
              rows={2}
              className="w-full px-3 py-2 rounded bg-zinc-900 text-zinc-200 text-xs font-mono placeholder:text-zinc-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="text-zinc-600 hover:text-zinc-400 text-[10px] font-mono transition-colors"
            >
              + note
            </button>
          )}
        </div>
      )}
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
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // End-of-queue review screen state
  const [rpe, setRpe] = useState('')
  const [completing, setCompleting] = useState(false)
  const { syncing: garminSyncing, lastSync: garminSync, syncGarmin } = useGarminSync()

  // Every PATCH to /api/session/[day] is chained through this ref so writes always reach
  // the server in the order they were issued. The PATCH handler does a naive read-merge-
  // write with no locking, so two concurrent requests (e.g. the last logCurrentSet's
  // exercises-only PATCH still in flight when handleCompleteSession's status/rpe/garmin
  // PATCH fires) can complete out of order and the older, narrower request silently
  // reverts fields the newer one just wrote. Serializing here closes that race.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve())
  function enqueueWrite<T>(run: () => Promise<T>): Promise<T> {
    const result = writeQueue.current.then(run)
    writeQueue.current = result.catch(() => {})
    return result
  }

  useEffect(() => {
    if (!day) return
    requestNotificationPermission()
    Promise.resolve().then(() => setLoadError(false))
    fetch(`/api/session/${day}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load session (${r.status})`)
        return r.json()
      })
      .then((data: Session) => {
        const initial: Record<number, SetEntry[]> = {}
        data.exercises.forEach((ex, i) => {
          if (ex.set_log && ex.set_log.length > 0) initial[i] = ex.set_log
        })
        const queue = buildLiveQueue(data)
        setSession(data)
        setLoggedSets(initial)
        setStepIndex(getResumeIndex(queue, initial))
        if (data.rpe != null) setRpe(String(data.rpe))
      })
      .catch(() => setLoadError(true))
  }, [day, loadAttempt])

  const queue = useMemo<LiveStep[]>(() => (session ? buildLiveQueue(session) : []), [session])
  const step = stepIndex != null ? queue[stepIndex] ?? null : null

  async function persist(exerciseIndex: number, updates: Partial<Session['exercises'][number]>) {
    if (!session) return
    setSaving(true)
    const nextExercises = session.exercises.map((ex, i) =>
      i === exerciseIndex ? { ...ex, ...updates } : ex,
    )
    setSession({ ...session, exercises: nextExercises })
    await enqueueWrite(() =>
      fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: nextExercises }),
      }),
    )
    setSaving(false)
  }

  function logCurrentSet(reps: string, weight: string, effort: SetEntry['effort'], note: string | undefined) {
    if (stepIndex == null || !step || step.kind !== 'set') return
    const entry: SetEntry = {
      reps: Number(reps) || 0,
      weight_kg: weight ? Number(weight) : null,
      effort,
      completed_at: new Date().toISOString(),
      ...(step.side ? { side: step.side } : {}),
    }
    const nextSets = [...(loggedSets[step.exerciseIndex] ?? []), entry]
    setLoggedSets((prev) => ({ ...prev, [step.exerciseIndex]: nextSets }))

    if (note !== undefined) {
      persist(step.exerciseIndex, { set_log: nextSets, actual_note: note })
    } else {
      persist(step.exerciseIndex, { set_log: nextSets })
    }

    setStepIndex(stepIndex + 1)
  }

  async function handleCompleteSession() {
    if (!session) return
    setCompleting(true)
    try {
      const sync = garminSync ?? (await syncGarmin(session.date, session.type))
      const exercises = session.exercises.map((ex, i) => {
        const log = loggedSets[i] ?? ex.set_log ?? []
        if (log.length === 0) return ex
        const derived = deriveExerciseAggregates(ex, log)
        return {
          ...ex,
          set_log: log,
          actual_sets: derived.actual_sets,
          actual_reps: derived.actual_reps,
          actual_weight_kg: derived.actual_weight_kg,
          effort: derived.effort,
        }
      })
      let globalIndex = 0
      const exercise_groups = session.exercise_groups?.map((group) => ({
        ...group,
        exercises: group.exercises.map(() => exercises[globalIndex++]),
      }))
      const res = await enqueueWrite(() => fetch(`/api/session/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercises,
          ...(exercise_groups ? { exercise_groups } : {}),
          status: 'completed',
          rpe: rpe !== '' ? Number(rpe) : null,
          garmin_activity_id: sync?.garmin_activity_id ?? session.garmin_activity_id ?? null,
          aerobic_training_effect: sync?.aerobic_training_effect ?? session.aerobic_training_effect ?? null,
          anaerobic_training_effect: sync?.anaerobic_training_effect ?? session.anaerobic_training_effect ?? null,
          training_stress_score: sync?.training_stress_score ?? session.training_stress_score ?? null,
          hr_zones: sync?.hr_zones ?? session.hr_zones ?? null,
        }),
      }))
      if (res.ok) {
        router.push(`/log/${day}`)
      }
    } finally {
      setCompleting(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
        <LiveHeader day={day} />
        <div className="text-red-400 font-mono text-sm">Couldn&apos;t load this session.</div>
        <button
          type="button"
          onClick={() => setLoadAttempt((n) => n + 1)}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-sm font-mono"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!session || stepIndex == null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
        <LiveHeader day={day} />
        <div className="text-zinc-400 font-mono">Loading…</div>
      </div>
    )
  }

  if (!step) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100 p-6">
        <LiveHeader day={day} />
        <div className="text-lime-400 font-mono">Session complete.</div>

        <div className="w-full max-w-sm space-y-2">
          <label className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
            Session RPE
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const selected = rpe === String(n)
              const color = n <= 3
                ? selected ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-emerald-600 hover:bg-zinc-700'
                : n <= 6
                ? selected ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-amber-600 hover:bg-zinc-700'
                : selected ? 'bg-red-500 text-white' : 'bg-zinc-800 text-red-600 hover:bg-zinc-700'
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRpe(rpe === String(n) ? '' : String(n))}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${color}`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => syncGarmin(session.date, session.type)}
          disabled={garminSyncing}
          className="w-full max-w-sm h-10 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
        >
          {garminSyncing ? 'Syncing Garmin…' : garminSync ? 'Garmin Synced ✓' : 'Sync Garmin Data'}
        </button>

        <button
          type="button"
          disabled={completing || garminSyncing}
          onClick={handleCompleteSession}
          className="w-full max-w-sm h-12 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-black text-xs tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
        >
          {completing ? 'Saving…' : 'Finish Session'}
        </button>
      </div>
    )
  }

  if (step.kind === 'rest') {
    const nextStep = queue[stepIndex + 1]
    const nextSet = nextStep && nextStep.kind === 'set' ? nextStep : null
    // If the upcoming set is part of a multi-exercise superset round, collect every
    // exercise in that same round so the athlete can see the whole superset in advance
    // instead of just the single next exercise.
    const upcomingGroup: Extract<LiveStep, { kind: 'set' }>[] = []
    if (nextSet && nextSet.groupId != null && nextSet.roundNumber != null) {
      let i = stepIndex + 1
      const seenExercises = new Set<number>()
      while (i < queue.length) {
        const s = queue[i]
        if (s.kind !== 'set' || s.groupId !== nextSet.groupId || s.roundNumber !== nextSet.roundNumber) break
        if (!seenExercises.has(s.exerciseIndex)) {
          seenExercises.add(s.exerciseIndex)
          upcomingGroup.push(s)
        }
        i++
      }
    } else if (nextSet) {
      upcomingGroup.push(nextSet)
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-950 p-6">
        <LiveHeader day={day} />
        <RestTimer
          key={stepIndex}
          seconds={step.seconds}
          storageKey={`rest-timer:${day}:${stepIndex}`}
          onDone={() => setStepIndex(stepIndex + 1)}
          onSkip={() => setStepIndex(stepIndex + 1)}
          onAddSeconds={() => {}}
        />
        {upcomingGroup.length > 0 && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
              {upcomingGroup.length > 1 ? 'Up next — superset' : 'Up next'}
            </div>
            {upcomingGroup.map((s) => (
              <div key={`${s.exerciseIndex}-${s.side ?? ''}`} className="flex flex-col items-center gap-2">
                <div className="text-zinc-300 text-sm font-mono">
                  {s.exercise.name}
                  {s.side && ` — ${sideLabel(s.side)}`}
                </div>
                <div className="max-w-[140px]">
                  <ExerciseDemo key={s.exercise.name} name={s.exercise.name} inline />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const canSwap = (loggedSets[step.exerciseIndex]?.length ?? 0) === 0
  const carryForwardRaw = getCarryForwardDefaults(loggedSets[step.exerciseIndex] ?? [], step.exercise, step.side)
  const carryForward = {
    reps: carryForwardRaw.reps != null ? String(carryForwardRaw.reps) : '',
    weight_kg: carryForwardRaw.weight_kg != null ? String(carryForwardRaw.weight_kg) : '',
  }
  const nextQueueStep = queue[stepIndex + 1]
  const isLastSet = !nextQueueStep || nextQueueStep.kind !== 'set' || nextQueueStep.exerciseIndex !== step.exerciseIndex
  const initialNote = session.exercises[step.exerciseIndex]?.actual_note ?? ''

  return (
    <SetEntryForm
      key={stepIndex}
      day={day}
      step={step}
      saving={saving}
      canSwap={canSwap}
      carryForward={carryForward}
      isLastSet={isLastSet}
      initialNote={initialNote}
      onLog={logCurrentSet}
    />
  )
}
