'use client'

import { useState } from 'react'
import SectionLabel from './SectionLabel'

type Preview = {
  format: 'strong' | 'hevy'
  sessions: number
  weeks: number
  exercises: number
  dateRange: [string, string] | null
  skippedExistingDays: string[]
  skippedRows: number
  applied: boolean
}

export default function ImportHistorySection() {
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(apply: boolean, text: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/import/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, apply }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Import failed')
      setPreview(body as Preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    setCsv(text)
    setFileName(file.name)
    void send(false, text)
  }

  return (
    <section className="space-y-3">
      <SectionLabel>Import history</SectionLabel>
      <p className="text-sm text-zinc-500">
        Bring your past workouts from <strong className="text-zinc-300">Strong</strong> or <strong className="text-zinc-300">Hevy</strong> (Settings → Export data → CSV in either app).
        Days you already logged here are never touched.
      </p>
      <label className="inline-flex h-10 items-center px-4 rounded-lg border border-zinc-700 text-xs font-mono uppercase tracking-widest cursor-pointer hover:border-zinc-500">
        {fileName || 'Choose CSV file'}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {busy && <p className="text-xs text-zinc-500">Reading…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {preview && (
        <div className="rounded-xl bg-zinc-900 p-4 space-y-2 text-sm">
          <p className="text-zinc-200">
            {preview.applied ? 'Imported' : 'Ready to import'} <strong>{preview.sessions}</strong> workouts across{' '}
            <strong>{preview.weeks}</strong> weeks ({preview.exercises} exercises) from {preview.format === 'strong' ? 'Strong' : 'Hevy'}
            {preview.dateRange && <> · {preview.dateRange[0]} → {preview.dateRange[1]}</>}
          </p>
          {preview.skippedExistingDays.length > 0 && (
            <p className="text-xs text-zinc-500">Skipping {preview.skippedExistingDays.length} day(s) that already have sessions here.</p>
          )}
          {preview.skippedRows > 0 && (
            <p className="text-xs text-zinc-500">Ignoring {preview.skippedRows} warm-up or timed/distance-only rows.</p>
          )}
          {!preview.applied && preview.sessions > 0 && csv && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(true, csv)}
              className="h-9 px-4 rounded-lg bg-lime-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-40"
            >
              Import {preview.sessions} workouts
            </button>
          )}
          {preview.applied && <p className="text-xs text-lime-400">Done — see them on the Progress page.</p>}
        </div>
      )}
    </section>
  )
}
