'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WeekDoc, NextWeekPlan, AppState } from '@/lib/schema'
import type { ImportResult, ImportError } from '@/lib/import'
import NewWeekButton from '@/components/NewWeekButton'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekSummaryData {
  week: string
  sessions: WeekDoc['sessions']
  week_summary: WeekDoc['week_summary']
  health_flags: WeekDoc['health_flags']
}

interface ExportSuccessData {
  photos_to_attach: string[]
  filename: string
  includes_photo_bundle: boolean
  photos_included_count: number
}

type ImportState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'success'; result: ImportResult }
  | { status: 'error'; errors: string[] }

interface AutomationNotesData {
  constraints: string
  priorities_context: string
  updated_at: string | null
}

interface ProposedPlanData {
  empty: boolean
  created_at?: string
  source?: string
  run_type?: 'manual' | 'daily' | 'weekly'
  notes_version?: string | null
  analysis_text?: string | null
  week_doc?: WeekDoc
  raw_json?: string
}

// ─── Day labels ───────────────────────────────────────────────────────────────

const DAY_KEYS: (keyof NextWeekPlan)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const DAY_LABELS: Record<keyof NextWeekPlan, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
  notes: 'Notes',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferSessionType(text: string): string {
  const lower = (text ?? '').toLowerCase()
  if (lower.includes('hyrox') || lower.includes('hiit') || lower.includes('conditioning')) return 'CONDITIONING'
  if (lower.includes('strength') || lower.includes('pull') || lower.includes('push') || lower.includes('gym')) return 'STRENGTH'
  if (lower.includes('mobility') || lower.includes('recovery') || lower.includes('active')) return 'RECOVERY'
  if (lower.includes('rest') || lower.includes('optional')) return 'REST'
  return 'RECOVERY'
}

function typeColor(type: string): string {
  switch (type) {
    case 'STRENGTH': return 'text-lime-400'
    case 'CONDITIONING': return 'text-orange-400'
    case 'RECOVERY': return 'text-sky-400'
    case 'REST': return 'text-zinc-500'
    default: return 'text-zinc-400'
  }
}

function inferGymWeekFromWeekDoc(week: WeekDoc): string {
  return week.next_week_plan?.wednesday?.toLowerCase().includes('pull') ? 'week_a' : 'week_b'
}

function AnalysisTextPanel({ analysisText }: { analysisText: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-3 space-y-2">
      <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Week Analysis</p>
      <p className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">{analysisText}</p>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-lime-400 rounded-full animate-spin" />
    </div>
  )
}

// ─── Export Section ───────────────────────────────────────────────────────────

function ExportSection() {
  const [weekData, setWeekData] = useState<WeekSummaryData | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState<ExportSuccessData | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [includePhotosInBundle, setIncludePhotosInBundle] = useState(false)
  const [includeDeloadInExport, setIncludeDeloadInExport] = useState(false)

  useEffect(() => {
    Promise.all([fetch('/api/week'), fetch('/api/state')])
      .then(async ([weekRes, stateRes]) => {
        const week = (await weekRes.json()) as WeekSummaryData | { empty: true }
        const state = (await stateRes.json()) as AppState
        if (!('empty' in week)) setWeekData(week)
        setAppState(state)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const endpointWithParams = `/api/export/v2?includePhotos=${includePhotosInBundle ? '1' : '0'}&includeDeload=${includeDeloadInExport ? '1' : '0'}`
      const res = await fetch(endpointWithParams, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        setExportError((err as { error?: string }).error ?? 'Export failed')
        return
      }

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = disposition.match(/filename="(.+?)"/)
      const filename = filenameMatch ? filenameMatch[1] : 'week-export.json'

      // Download the file
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const isZipBundle = (res.headers.get('Content-Type') ?? '').includes('application/zip')
      let photosToAttach: string[] = []
      let photosIncludedCount = Number(res.headers.get('X-Photos-Included') ?? 0)

      if (!isZipBundle) {
        const text = await blob.text()
        const payload = JSON.parse(text) as { photos_to_attach?: string[] }
        photosToAttach = payload.photos_to_attach ?? []
      } else if (!Number.isFinite(photosIncludedCount)) {
        photosIncludedCount = 0
      }

      if (includeDeloadInExport && weekData) {
        const stateRes = await fetch('/api/state', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deloadCounter: 0,
            lastDeloadWeek: weekData.week,
            isDeloadWeek: false,
          }),
        })
        if (!stateRes.ok) {
          const err = await stateRes.json().catch(() => ({ error: 'Failed to update deload state' }))
          setExportError((err as { error?: string }).error ?? 'Failed to update deload state')
          return
        }
        const updatedState = (await stateRes.json()) as AppState
        setAppState(updatedState)
      }

      setExportSuccess({
        photos_to_attach: photosToAttach,
        filename,
        includes_photo_bundle: isZipBundle,
        photos_included_count: photosIncludedCount,
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setExporting(false)
    }
  }

  const completedSessions = weekData?.sessions.filter((s) => s.status === 'completed').length ?? 0
  const totalCalories = weekData?.week_summary.total_calories ?? 0
  const activeFlags = (weekData?.health_flags ?? []).filter((f) => !f.cleared).length
  const deloadCounter = appState?.deloadCounter ?? 0
  const deloadWindowLabel =
    deloadCounter === 0
      ? 'Deload tagged this week'
      : deloadCounter < 8
        ? `${8 - deloadCounter} week${8 - deloadCounter === 1 ? '' : 's'} to deload window`
        : deloadCounter <= 10
          ? 'In deload window (8–10 weeks)'
          : `${deloadCounter - 10} week${deloadCounter - 10 === 1 ? '' : 's'} overdue`

  return (
    <section className="space-y-5">
      <SectionDivider label="Export This Week" />

      {/* Week header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-zinc-50">
            Export Week
          </h2>
          {weekData && (
            <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase mt-1">
              {weekData.week}
            </p>
          )}
        </div>
      </div>

      {/* Week summary */}
      {loading ? (
        <div className="h-20 flex items-center">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-lime-400 rounded-full animate-spin" />
        </div>
      ) : weekData ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase mb-1">Sessions</p>
            <p className="text-zinc-50 text-2xl font-black">
              {completedSessions}
              <span className="text-zinc-600 text-base font-bold">/7</span>
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase mb-1">Calories</p>
            <p className="text-zinc-50 text-2xl font-black">
              {totalCalories > 0 ? totalCalories.toLocaleString() : '—'}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase mb-1">Flags</p>
            <p className={`text-2xl font-black ${activeFlags > 0 ? 'text-amber-400' : 'text-zinc-50'}`}>
              {activeFlags}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
          <p className="text-zinc-500 text-sm font-mono">No active week found.</p>
        </div>
      )}

      {/* Export buttons */}
      {!exportSuccess && (
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mb-1">
              Deload Counter
            </p>
            <p className="text-zinc-300 text-xs font-mono">
              Week {deloadCounter} since last deload • {deloadWindowLabel}
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <input
              type="checkbox"
              checked={includePhotosInBundle}
              onChange={(e) => setIncludePhotosInBundle(e.target.checked)}
              className="h-4 w-4 accent-lime-400"
            />
            <span className="text-zinc-300 text-xs font-mono">
              Include photos in one ZIP bundle
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <input
              type="checkbox"
              checked={includeDeloadInExport}
              onChange={(e) => setIncludeDeloadInExport(e.target.checked)}
              className="h-4 w-4 accent-lime-400"
            />
            <span className="text-zinc-300 text-xs font-mono">
              Mark this export as a deload week
            </span>
          </label>
          <button
            onClick={() => handleExport()}
            disabled={exporting || !weekData}
            className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-950 rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              'Export Week'
            )}
          </button>
        </div>
      )}

      {exportError && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-xl px-5 py-4">
          <p className="text-red-400 text-xs font-mono font-bold tracking-widest uppercase mb-1">Export Failed</p>
          <p className="text-red-300 text-sm">{exportError}</p>
        </div>
      )}

      {/* Success state */}
      {exportSuccess && (
        <div className="space-y-4">
          {/* Green success banner */}
          <div className="bg-emerald-400/10 border border-emerald-400/30 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="text-emerald-400 text-xl" aria-hidden="true">✓</span>
            <div>
              <p className="text-emerald-400 text-xs font-mono font-bold tracking-widest uppercase">
                Export Saved to Downloads
              </p>
              <p className="text-zinc-500 text-xs font-mono mt-0.5">{exportSuccess.filename}</p>
            </div>
          </div>

          {exportSuccess.includes_photo_bundle && (
            <div className="bg-sky-400/10 border border-sky-400/30 rounded-xl px-5 py-4">
              <p className="text-sky-400 text-xs font-mono font-bold tracking-widest uppercase mb-1">
                Bundle Includes Photos
              </p>
              <p className="text-sky-200 text-xs font-mono">
                ZIP contains JSON and {exportSuccess.photos_included_count} photo{exportSuccess.photos_included_count === 1 ? '' : 's'}.
              </p>
            </div>
          )}

          {/* Photos to attach (JSON-only export) */}
          {!exportSuccess.includes_photo_bundle && exportSuccess.photos_to_attach.length > 0 && (
            <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl px-5 py-4">
              <p className="text-amber-400 text-xs font-mono font-bold tracking-widest uppercase mb-3">
                📎 Attach These Photos to Your Claude Message
              </p>
              <div className="space-y-1.5">
                {exportSuccess.photos_to_attach.map((photo, i) => (
                  <p key={i} className="text-amber-200 text-xs font-mono break-all">
                    {photo}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Instructions card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 space-y-2">
            <p className="text-zinc-400 text-xs font-mono font-bold tracking-widest uppercase">
              Next Steps
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {exportSuccess.includes_photo_bundle
                ? 'Upload the ZIP to Claude. It already includes your JSON and photos.'
                : 'Paste the exported JSON into your Claude project chat. Attach any listed photos.'}
              Claude will return a new training plan JSON.
            </p>
          </div>

          {/* Re-export option */}
          <button
            onClick={() => {
              setExportSuccess(null)
              setExportError(null)
            }}
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Export Again
          </button>
        </div>
      )}
    </section>
  )
}

// ─── Import Section ───────────────────────────────────────────────────────────

function ImportSection() {
  const router = useRouter()
  const [rawText, setRawText] = useState('')
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState<AutomationNotesData>({
    constraints: '',
    priorities_context: '',
    updated_at: null,
  })
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesMsg, setNotesMsg] = useState<string | null>(null)
  const [proposed, setProposed] = useState<ProposedPlanData>({ empty: true })
  const [proposedLoading, setProposedLoading] = useState(true)
  const [proposedSubmitting, setProposedSubmitting] = useState(false)
  const [draftWeek, setDraftWeek] = useState<WeekDoc | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [proposedMsg, setProposedMsg] = useState<string | null>(null)
  const [expandedSessionIndex, setExpandedSessionIndex] = useState<number | null>(0)

  async function refreshProposed() {
    setProposedLoading(true)
    try {
      const res = await fetch('/api/proposed', { cache: 'no-store' })
      const data = (await res.json()) as ProposedPlanData
      setProposed(data)
      if (!data.empty && data.week_doc) {
        setDraftWeek(data.week_doc)
        setExpandedSessionIndex(0)
      } else {
        setDraftWeek(null)
        setExpandedSessionIndex(null)
      }
    } finally {
      setProposedLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [notesRes] = await Promise.all([
          fetch('/api/automation/notes', { cache: 'no-store' }),
          refreshProposed(),
        ])
        if (notesRes.ok) {
          const notesData = (await notesRes.json()) as AutomationNotesData
          setNotes(notesData)
        }
      } catch {
        // Non-blocking UI section
      }
    })()
  }, [])

  async function handleSaveNotes() {
    setNotesSaving(true)
    setNotesMsg(null)
    try {
      const res = await fetch('/api/automation/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notes),
      })
      const data = (await res.json()) as AutomationNotesData | { error?: string }
      if (!res.ok) {
        setNotesMsg((data as { error?: string }).error ?? 'Failed to save notes')
        return
      }
      setNotes(data as AutomationNotesData)
      setNotesMsg('Saved')
    } catch {
      setNotesMsg('Failed to save notes')
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleLoadProposedJson() {
    if (!proposed.raw_json) return
    setRawText(proposed.raw_json)
    setImportState({ status: 'idle' })
    setProposedMsg('Loaded proposed JSON into editor')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  async function handleClearProposed() {
    setProposedMsg(null)
    const res = await fetch('/api/proposed', { method: 'DELETE' })
    if (!res.ok) {
      setProposedMsg('Failed to clear proposed JSON')
      return
    }
    setProposed({ empty: true })
    setDraftWeek(null)
    setProposedMsg('Cleared proposed JSON')
  }

  function updateDraftSession(index: number, updates: Partial<WeekDoc['sessions'][number]>) {
    setDraftWeek((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sessions: prev.sessions.map((session, i) => (i === index ? { ...session, ...updates } : session)),
      }
    })
  }

  function parseOptionalNumber(value: string): number | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  function parseRepsInput(value: string): number | string | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && /^-?\d+(\.\d+)?$/.test(trimmed)) return parsed
    return trimmed
  }

  function updateDraftExercise(
    sessionIndex: number,
    exerciseIndex: number,
    updates: Partial<WeekDoc['sessions'][number]['exercises'][number]>,
  ) {
    setDraftWeek((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sessions: prev.sessions.map((session, i) => {
          if (i !== sessionIndex) return session
          return {
            ...session,
            exercises: session.exercises.map((exercise, j) =>
              j === exerciseIndex ? { ...exercise, ...updates } : exercise
            ),
          }
        }),
      }
    })
  }

  function addDraftExercise(sessionIndex: number) {
    setDraftWeek((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sessions: prev.sessions.map((session, i) => {
          if (i !== sessionIndex) return session
          return {
            ...session,
            exercises: [
              ...session.exercises,
              {
                name: '',
                sets: null,
                reps: null,
                weight_kg: null,
                notes: null,
                alternatives: [],
              },
            ],
          }
        }),
      }
    })
  }

  function removeDraftExercise(sessionIndex: number, exerciseIndex: number) {
    setDraftWeek((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sessions: prev.sessions.map((session, i) => {
          if (i !== sessionIndex) return session
          return {
            ...session,
            exercises: session.exercises.filter((_, j) => j !== exerciseIndex),
          }
        }),
      }
    })
  }

  function moveDraftExercise(sessionIndex: number, exerciseIndex: number, direction: -1 | 1) {
    setDraftWeek((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sessions: prev.sessions.map((session, i) => {
          if (i !== sessionIndex) return session
          const nextIndex = exerciseIndex + direction
          if (nextIndex < 0 || nextIndex >= session.exercises.length) return session
          const nextExercises = [...session.exercises]
          const [item] = nextExercises.splice(exerciseIndex, 1)
          nextExercises.splice(nextIndex, 0, item)
          return { ...session, exercises: nextExercises }
        }),
      }
    })
  }

  async function handleSaveDraftAdjustments() {
    if (!draftWeek || proposed.empty) return
    setProposedMsg(null)
    setDraftSaving(true)
    try {
      const res = await fetch('/api/proposed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_doc: draftWeek,
          analysis_text: proposed.analysis_text ?? null,
          source: 'athlete-review',
          run_type: proposed.run_type ?? 'manual',
        }),
      })
      const data = (await res.json()) as ProposedPlanData | { error?: string }
      if (!res.ok) {
        setProposedMsg((data as { error?: string }).error ?? 'Failed to save adjustments')
        return
      }
      const next = data as ProposedPlanData
      setProposed(next)
      setDraftWeek(next.week_doc ?? draftWeek)
      setProposedMsg('Saved your adjustments for Claude re-evaluation')
    } catch {
      setProposedMsg('Failed to save adjustments')
    } finally {
      setDraftSaving(false)
    }
  }

  async function handleSubmitProposedFinal() {
    setProposedMsg(null)
    setImportState({ status: 'validating' })
    setProposedSubmitting(true)
    try {
      if (draftWeek && !proposed.empty) {
        const saveRes = await fetch('/api/proposed', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week_doc: draftWeek,
            analysis_text: proposed.analysis_text ?? null,
            source: 'athlete-review',
            run_type: proposed.run_type ?? 'manual',
          }),
        })
        if (!saveRes.ok) {
          setImportState({ status: 'error', errors: ['Save adjustments before final submit failed'] })
          return
        }
      }

      const res = await fetch('/api/proposed/apply', { method: 'POST' })
      const data = (await res.json()) as {
        ok?: boolean
        data?: WeekDoc
        activation?: 'immediate' | 'scheduled'
        errors?: string[]
        error?: string
      }

      if (!res.ok || !data.ok || !data.data) {
        const errors =
          data.errors && data.errors.length > 0
            ? data.errors
            : [data.error ?? 'Failed to apply proposed plan']
        setImportState({ status: 'error', errors })
        return
      }

      const applied = data.data
      setImportState({
        status: 'success',
        result: {
          ok: true,
          data: applied,
          analysis_text: proposed.analysis_text ?? null,
          nextWeek: {
            week: applied.week,
            gymWeek: inferGymWeekFromWeekDoc(applied),
            sessionsCount: Object.keys(applied.next_week_plan ?? {}).filter((key) => key !== 'notes').length,
          },
        },
      })
      setProposedMsg(
        data.activation === 'scheduled'
          ? 'Final plan scheduled — it will auto-activate on Monday'
          : 'Final plan submitted and applied',
      )
      await refreshProposed()
    } catch (error) {
      setImportState({
        status: 'error',
        errors: [error instanceof Error ? error.message : 'Failed to apply proposed plan'],
      })
    } finally {
      setProposedSubmitting(false)
    }
  }

  async function handleImport() {
    if (!rawText.trim()) return
    setImportState({ status: 'validating' })

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: rawText }),
      })

      const data = (await res.json()) as ImportResult | ImportError

      if (!res.ok || !data.ok) {
        const errData = data as ImportError
        setImportState({ status: 'error', errors: errData.errors ?? ['Unknown error'] })
        return
      }

      setImportState({ status: 'success', result: data as ImportResult })
    } catch (e) {
      setImportState({
        status: 'error',
        errors: [e instanceof Error ? e.message : 'Unexpected error'],
      })
    }
  }

  function handleConfirm() {
    router.push('/')
  }

  function handleTryAgain() {
    setImportState({ status: 'idle' })
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const GYM_WEEK_LABELS: Record<string, string> = {
    week_a: 'WEEK A — PULL',
    week_b: 'WEEK B — PUSH',
    legs_week: 'LEGS WEEK',
  }

  return (
    <section className="space-y-5">
      <SectionDivider label="Plan Next Week" />

      <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-zinc-50">
        Apply Next Week Plan
      </h2>
      <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
        Default flow: MCP automation. Manual JSON import is in Advanced.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
          MCP context notes (used by Claude MCP planner)
        </p>
        <p className="text-zinc-600 text-[10px] font-mono leading-relaxed">
          Keep these concise and actionable so the proposed week reflects your real constraints.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <textarea
            value={notes.constraints}
            onChange={(e) => setNotes((prev) => ({ ...prev, constraints: e.target.value }))}
            rows={5}
            placeholder="Constraints (travel/schedule limits, health flags, equipment limits, temporary restrictions)"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-4 py-3 text-zinc-200 text-xs font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
          />
          <textarea
            value={notes.priorities_context}
            onChange={(e) => setNotes((prev) => ({ ...prev, priorities_context: e.target.value }))}
            rows={5}
            placeholder="Priorities & context (what to optimize first this week + any freeform context)"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-4 py-3 text-zinc-200 text-xs font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handleSaveNotes}
            disabled={notesSaving}
            className="h-10 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 font-bold text-[10px] tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
          >
            {notesSaving ? 'Saving…' : 'Save notes'}
          </button>
          <p className="text-zinc-600 text-[10px] font-mono">
            {notes.updated_at ? `Updated ${new Date(notes.updated_at).toLocaleString()}` : 'Not saved yet'}
          </p>
        </div>
        {notesMsg && (
          <p className={`text-[10px] font-mono ${notesMsg === 'Saved' ? 'text-lime-400' : 'text-red-400'}`}>
            {notesMsg}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
          Proposed plan from automation
        </p>
        {proposedLoading ? (
          <p className="text-zinc-600 text-xs font-mono">Loading…</p>
        ) : proposed.empty ? (
          <p className="text-zinc-500 text-xs font-mono">No proposed plan yet.</p>
        ) : (
          <>
            <div className="text-xs font-mono text-zinc-400 space-y-1">
              <p>Source: {proposed.source ?? 'unknown'}</p>
              <p>Run: {proposed.run_type ?? 'manual'}</p>
              <p>Created: {proposed.created_at ? new Date(proposed.created_at).toLocaleString() : 'unknown'}</p>
            </div>
            {draftWeek && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                  <p className="text-zinc-400 text-[10px] font-mono tracking-[0.15em] uppercase">
                    Review proposed week
                  </p>
                  <p className="text-zinc-500 text-[10px] font-mono whitespace-nowrap">
                    {draftWeek.week}
                  </p>
                </div>
                <div className="px-3 py-2 border-b border-zinc-800 text-zinc-600 text-[10px] font-mono">
                  Expand a day to edit. Completed or in-progress sessions are locked.
                </div>
                <div className="divide-y divide-zinc-800">
                  {draftWeek.sessions.map((session, index) => (
                    <div key={`${session.date}-${session.day}-${index}`} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSessionIndex((prev) => (prev === index ? null : index))
                        }
                        className="w-full flex flex-wrap items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <p className="text-zinc-300 text-xs font-mono font-bold tracking-widest uppercase">
                            {session.day}
                          </p>
                          <p className="text-zinc-600 text-[10px] font-mono mt-0.5">{session.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-mono uppercase tracking-wide ${session.status === 'planned' ? 'border-zinc-700 text-zinc-400' : 'border-amber-700/40 text-amber-300'}`}>
                            {session.status}
                          </span>
                          <span className="text-zinc-500 text-[10px] font-mono">
                            {session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'}
                          </span>
                          <span className="text-zinc-500 text-[10px] font-mono">
                            {expandedSessionIndex === index ? 'Hide' : 'Edit'}
                          </span>
                        </div>
                      </button>
                      {expandedSessionIndex === index && (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                            <p className="text-zinc-600 text-[10px] font-mono tracking-[0.12em] uppercase">Session type</p>
                            <input
                              value={session.type}
                              onChange={(e) => updateDraftSession(index, { type: e.target.value })}
                              disabled={session.status !== 'planned'}
                              className="w-full h-9 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-lg px-3 text-zinc-200 text-xs font-mono outline-none transition-colors"
                            />
                            <p className="text-zinc-600 text-[10px] font-mono tracking-[0.12em] uppercase">Session notes</p>
                            <textarea
                              value={session.notes ?? ''}
                              onChange={(e) => updateDraftSession(index, { notes: e.target.value })}
                              disabled={session.status !== 'planned'}
                              rows={2}
                              placeholder="Adjustment notes for this day"
                              className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.15em] uppercase">Exercises</p>
                            {session.exercises.length === 0 ? (
                              <p className="text-zinc-600 text-xs font-mono">No exercises yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {session.exercises.map((exercise, exerciseIndex) => (
                                  <div key={`${session.date}-${exercise.name}-${exerciseIndex}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 space-y-2">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                      <input
                                        value={exercise.name ?? ''}
                                        onChange={(e) => updateDraftExercise(index, exerciseIndex, { name: e.target.value })}
                                        disabled={session.status !== 'planned'}
                                        placeholder="Exercise name"
                                        className="w-full h-9 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-lg px-3 text-zinc-200 text-xs font-mono outline-none transition-colors"
                                      />
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => moveDraftExercise(index, exerciseIndex, -1)}
                                          disabled={session.status !== 'planned' || exerciseIndex === 0}
                                          className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono uppercase tracking-wide disabled:opacity-40"
                                        >
                                          Up
                                        </button>
                                        <button
                                          onClick={() => moveDraftExercise(index, exerciseIndex, 1)}
                                          disabled={session.status !== 'planned' || exerciseIndex === session.exercises.length - 1}
                                          className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono uppercase tracking-wide disabled:opacity-40"
                                        >
                                          Down
                                        </button>
                                        <button
                                          onClick={() => removeDraftExercise(index, exerciseIndex)}
                                          disabled={session.status !== 'planned'}
                                          className="h-8 px-2 rounded-md border border-red-900/50 bg-red-950/30 hover:bg-red-900/30 text-red-300 text-[10px] font-mono uppercase tracking-wide disabled:opacity-40"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <input
                                        value={exercise.sets ?? ''}
                                        onChange={(e) => updateDraftExercise(index, exerciseIndex, { sets: parseOptionalNumber(e.target.value) })}
                                        disabled={session.status !== 'planned'}
                                        placeholder="Sets"
                                        inputMode="decimal"
                                        className="w-full h-8 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-md px-2 text-zinc-200 text-xs font-mono outline-none transition-colors"
                                      />
                                      <input
                                        value={exercise.reps == null ? '' : String(exercise.reps)}
                                        onChange={(e) => updateDraftExercise(index, exerciseIndex, { reps: parseRepsInput(e.target.value) })}
                                        disabled={session.status !== 'planned'}
                                        placeholder="Reps"
                                        className="w-full h-8 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-md px-2 text-zinc-200 text-xs font-mono outline-none transition-colors"
                                      />
                                      <input
                                        value={exercise.weight_kg ?? ''}
                                        onChange={(e) => updateDraftExercise(index, exerciseIndex, { weight_kg: parseOptionalNumber(e.target.value) })}
                                        disabled={session.status !== 'planned'}
                                        placeholder="kg"
                                        inputMode="decimal"
                                        className="w-full h-8 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-md px-2 text-zinc-200 text-xs font-mono outline-none transition-colors"
                                      />
                                    </div>
                                    <textarea
                                      value={exercise.notes ?? ''}
                                      onChange={(e) => updateDraftExercise(index, exerciseIndex, { notes: e.target.value })}
                                      disabled={session.status !== 'planned'}
                                      rows={2}
                                      placeholder="Exercise notes"
                                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-md px-2 py-2 text-zinc-300 text-xs font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => addDraftExercise(index)}
                              disabled={session.status !== 'planned'}
                              className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono uppercase tracking-wide disabled:opacity-40"
                            >
                              Add exercise
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-3 border-t border-zinc-800 flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveDraftAdjustments}
                    disabled={draftSaving}
                    className="h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 font-bold text-[10px] tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
                  >
                    {draftSaving ? 'Saving…' : 'Save Adjustments'}
                  </button>
                  <p className="text-zinc-600 text-[10px] font-mono self-center">
                    Saved edits become the latest proposed plan Claude can re-evaluate.
                  </p>
                </div>
              </div>
            )}
            {typeof proposed.analysis_text === 'string' && proposed.analysis_text.trim().length > 0 && (
              <AnalysisTextPanel analysisText={proposed.analysis_text} />
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSubmitProposedFinal}
                disabled={proposedSubmitting}
                className="h-10 px-4 rounded-lg bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-[10px] tracking-[0.15em] uppercase transition-colors disabled:opacity-50"
              >
                {proposedSubmitting ? 'Submitting…' : 'Submit Final Plan'}
              </button>
              <button
                onClick={handleClearProposed}
                className="h-10 px-4 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 font-bold text-[10px] tracking-[0.15em] uppercase transition-colors"
              >
                Clear proposed
              </button>
            </div>
          </>
        )}
        {proposedMsg && (
          <p className={`text-[10px] font-mono ${proposedMsg.toLowerCase().includes('failed') ? 'text-red-400' : 'text-lime-400'}`}>
            {proposedMsg}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
          Or create from saved template
        </p>
        <NewWeekButton
          label="Create from Saved Template"
          className="w-full h-11 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-zinc-50 font-bold text-xs tracking-[0.15em] uppercase rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all disabled:opacity-50"
        />
      </div>

      {/* Idle */}
      {(importState.status === 'idle' || importState.status === 'error') && (
        <div className="space-y-4">
          {importState.status === 'error' && (
            <div className="bg-red-400/10 border border-red-400/30 rounded-xl px-5 py-4 space-y-2">
              <p className="text-red-400 text-xs font-mono font-bold tracking-widest uppercase">
                Validation Errors
              </p>
              <ul className="space-y-1">
                {importState.errors.map((err, i) => (
                  <li key={i} className="text-red-300 text-xs font-mono">
                    {err}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleTryAgain}
                className="mt-2 text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          <details className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <summary className="cursor-pointer list-none text-zinc-400 hover:text-zinc-200 text-xs font-mono font-bold tracking-widest uppercase">
              Advanced: Manual export/import loop
            </summary>
            <div className="mt-3 space-y-3">
              <ExportSection />
              <div className="h-px bg-zinc-800" />
              <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">
                Import raw JSON manually
              </p>
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste Claude's JSON response here..."
                rows={10}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-4 py-3 text-zinc-200 text-sm font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleImport}
                  disabled={!rawText.trim()}
                  className="h-10 px-4 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-black text-[10px] tracking-[0.15em] uppercase rounded-lg transition-colors"
                >
                  Import JSON
                </button>
                {!proposed.empty && proposed.raw_json && (
                  <button
                    onClick={handleLoadProposedJson}
                    className="h-10 px-4 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 font-bold text-[10px] tracking-[0.15em] uppercase transition-colors"
                  >
                    Load proposed JSON
                  </button>
                )}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Validating */}
      {importState.status === 'validating' && <Spinner />}

      {/* Success */}
      {importState.status === 'success' && (
        <div className="space-y-5">
          {/* Gym week badge */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-mono font-bold tracking-widest uppercase">
              {GYM_WEEK_LABELS[importState.result.nextWeek.gymWeek] ?? importState.result.nextWeek.gymWeek}
            </span>
            <span className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
              {importState.result.nextWeek.week}
            </span>
          </div>

          {/* Day-by-day preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800 overflow-hidden">
            <div className="px-5 py-3">
              <p className="text-zinc-400 text-xs font-mono font-bold tracking-widest uppercase">
                Next Week Preview
              </p>
            </div>
            {DAY_KEYS.map((day) => {
              const plan = importState.result.data.next_week_plan[day]
              if (!plan) return null
              const sessionType = inferSessionType(plan)
              return (
                <div key={day} className="px-5 py-3 flex items-start gap-4">
                  <span className="text-zinc-600 text-xs font-mono font-bold tracking-widest uppercase w-8 shrink-0 mt-0.5">
                    {DAY_LABELS[day]}
                  </span>
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`text-xs font-mono font-bold tracking-wide shrink-0 ${typeColor(sessionType)}`}>
                      {sessionType}
                    </span>
                    <span className="text-zinc-400 text-xs font-mono truncate">
                      {plan}
                    </span>
                  </div>
                </div>
              )
            })}
            {importState.result.data.next_week_plan.notes && (
              <div className="px-5 py-3 flex items-start gap-4">
                <span className="text-zinc-600 text-xs font-mono font-bold tracking-widest uppercase w-8 shrink-0 mt-0.5">
                  Note
                </span>
                <span className="text-zinc-500 text-xs font-mono italic">
                  {importState.result.data.next_week_plan.notes}
                </span>
              </div>
            )}
          </div>

          {typeof importState.result.analysis_text === 'string' && importState.result.analysis_text.trim().length > 0 && (
            <AnalysisTextPanel analysisText={importState.result.analysis_text} />
          )}

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors"
          >
            Go to Week
          </button>

          <button
            onClick={() => setImportState({ status: 'idle' })}
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Start Over
          </button>
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* Page header */}
        <header>
          <Link
            href="/"
            className="text-zinc-600 hover:text-zinc-400 text-xs font-mono tracking-widest uppercase transition-colors"
          >
            ← Back
          </Link>
          <div className="mt-4">
            <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-1">
              PanTrainer
            </p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight uppercase leading-none text-zinc-50">
              Weekly<br />Claude Loop
            </h1>
          </div>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-zinc-400 text-[10px] font-mono tracking-[0.2em] uppercase mb-2">
            Recommended Weekly Flow
          </p>
          <p className="text-zinc-300 text-sm font-mono">
            Default: review and submit MCP proposed plans below. Use manual export/import only in Advanced.
          </p>
        </section>

        {/* Import */}
        <ImportSection />

      </div>
    </main>
  )
}
