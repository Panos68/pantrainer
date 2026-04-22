'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WeekDoc, NextWeekPlan } from '@/lib/schema'
import type { ImportResult, ImportError } from '@/lib/import'

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
  version: 'v1' | 'v2'
}

type ImportState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'success'; result: ImportResult }
  | { status: 'error'; errors: string[] }

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
  const [loading, setLoading] = useState(true)
  const [exportingVersion, setExportingVersion] = useState<'v1' | 'v2' | null>(null)
  const [exportSuccess, setExportSuccess] = useState<ExportSuccessData | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/week')
      .then((r) => r.json())
      .then((data) => {
        if (!data.empty) setWeekData(data as WeekSummaryData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleExport(version: 'v1' | 'v2') {
    setExportingVersion(version)
    setExportError(null)
    try {
      const endpoint = version === 'v2' ? '/api/export/v2' : '/api/export'
      const res = await fetch(endpoint, { method: 'POST' })
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

      // Parse the JSON to get photos_to_attach
      const text = await blob.text()
      const payload = JSON.parse(text) as { photos_to_attach?: string[] }

      setExportSuccess({
        photos_to_attach: payload.photos_to_attach ?? [],
        filename,
        version,
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setExportingVersion(null)
    }
  }

  const completedSessions = weekData?.sessions.filter((s) => s.status === 'completed').length ?? 0
  const totalCalories = weekData?.week_summary.total_calories ?? 0
  const activeFlags = (weekData?.health_flags ?? []).filter((f) => !f.cleared).length

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handleExport('v1')}
            disabled={exportingVersion !== null || !weekData}
            className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            {exportingVersion === 'v1' ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-950 rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              'Export Week (v1)'
            )}
          </button>

          <button
            onClick={() => handleExport('v2')}
            disabled={exportingVersion !== null || !weekData}
            className="w-full h-14 bg-sky-400 hover:bg-sky-300 active:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            {exportingVersion === 'v2' ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-950 rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              'Export Week (v2)'
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
                Export {exportSuccess.version.toUpperCase()} Saved to Downloads
              </p>
              <p className="text-zinc-500 text-xs font-mono mt-0.5">{exportSuccess.filename}</p>
            </div>
          </div>

          {/* Photos to attach */}
          {exportSuccess.photos_to_attach.length > 0 && (
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
              Paste the exported JSON into your Claude project chat. Attach any listed photos.
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
      <SectionDivider label="Import New Plan" />

      <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-zinc-50">
        Import Next Week Plan
      </h2>
      <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
        Recommended: Export → Claude plan → Import
      </p>

      {/* Idle */}
      {(importState.status === 'idle' || importState.status === 'error') && (
        <div className="space-y-4">
          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste Claude's JSON response here..."
            rows={10}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-4 py-3 text-zinc-200 text-sm font-mono placeholder:text-zinc-600 resize-y outline-none transition-colors"
          />

          {/* Error state */}
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

          <button
            onClick={handleImport}
            disabled={!rawText.trim()}
            className="w-full h-14 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors"
          >
            Import Plan
          </button>
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
            Export this week → Ask Claude for next week JSON → Import here → Log workouts.
          </p>
        </section>

        {/* Export */}
        <ExportSection />

        {/* Divider */}
        <div className="h-px bg-zinc-800" />

        {/* Import */}
        <ImportSection />

      </div>
    </main>
  )
}
