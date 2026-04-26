'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'

interface ScoreBreakdown {
  total: number
  sleep: number
  rhr: number
  load: number
  subjective: number
  label: 'Ready' | 'Moderate' | 'Rest'
  color: 'green' | 'amber' | 'red'
}

interface ReadinessData {
  energy_level: number
  sleep_quality: number
  mood: number
}

interface ApiResponse {
  date: string
  score: ScoreBreakdown
  readiness: ReadinessData | null
  sleep_avg_7d: number | null
  has_garmin_sleep: boolean
}

const EMOJI_SCALE = ['😴', '😕', '😐', '🙂', '⚡']

const COLOR = {
  green: { score: 'text-green-400', label: 'text-green-400', border: 'border-green-900' },
  amber: { score: 'text-amber-400', label: 'text-amber-400', border: 'border-amber-900' },
  red:   { score: 'text-red-400',   label: 'text-red-400',   border: 'border-red-900'   },
}

function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-[11px] w-14">{label}</span>
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.round((value / max) * 100)}%` }}
        />
      </div>
      <span className="text-zinc-500 text-[11px] w-10 text-right">{value}/{max}</span>
    </div>
  )
}

function EmojiPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-300 text-sm">{label}</span>
      <div className="flex gap-1">
        {EMOJI_SCALE.map((emoji, i) => (
          <button
            key={i}
            onClick={() => onChange(i + 1)}
            className={`text-lg px-1 rounded transition-opacity ${
              value === i + 1 ? 'opacity-100 bg-zinc-700' : 'opacity-30 hover:opacity-60'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function RecoveryScorePanel() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [energy, setEnergy] = useState(3)
  const [sleepQ, setSleepQ] = useState(3)
  const [mood, setMood] = useState(3)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const d: ApiResponse = await fetch(`/api/readiness?date=${today}`).then((r) => r.json())
        if (!d.has_garmin_sleep) {
          // Auto-fetch Garmin sleep for today if not yet saved
          await fetch('/api/garmin/recovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: today }),
          }).catch(() => {})
          const refreshed: ApiResponse = await fetch(`/api/readiness?date=${today}`).then((r) => r.json())
          setData(refreshed)
          if (!refreshed.readiness) setCheckinOpen(true)
        } else {
          setData(d)
          if (!d.readiness) setCheckinOpen(true)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [today])

  async function submitCheckin() {
    setSaving(true)
    try {
      await fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, energy_level: energy, sleep_quality: sleepQ, mood }),
      })
      const updated: ApiResponse = await fetch(`/api/readiness?date=${today}`).then((r) => r.json())
      setData(updated)
      setCheckinOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-32 mb-3" />
        <div className="h-10 bg-zinc-800 rounded w-20" />
      </div>
    )
  }

  if (!data) return null

  const { score } = data
  const c = COLOR[score.color]

  return (
    <div className={`bg-zinc-900 border ${c.border} rounded-xl p-3 space-y-2.5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-500 text-[11px] uppercase tracking-widest mb-0.5">Recovery Score</p>
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-black ${c.score}`}>{score.total}</span>
            <span className="text-zinc-600 text-sm">/100</span>
          </div>
          <p className={`text-xs ${c.label} mt-0.5`}>{score.label}</p>
        </div>
        {!data.readiness && !checkinOpen && (
          <button
            onClick={() => setCheckinOpen(true)}
            className="text-xs text-zinc-400 border border-zinc-700 rounded-lg px-2 py-1 hover:border-zinc-500 transition-colors"
          >
            Add check-in
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <BreakdownBar label="Sleep" value={score.sleep} max={40} />
        {data.sleep_avg_7d != null && (
          <p className="text-[10px] text-zinc-600 pl-16 -mt-1">7d avg {data.sleep_avg_7d}h</p>
        )}
        <BreakdownBar label="RHR" value={score.rhr} max={30} />
        <BreakdownBar label="Load" value={score.load} max={20} />
        <BreakdownBar label="Feeling" value={score.subjective} max={10} />
      </div>

      {checkinOpen && (
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <p className="text-zinc-400 text-xs uppercase tracking-widest">How are you feeling?</p>
          <EmojiPicker label="Energy" value={energy} onChange={setEnergy} />
          <EmojiPicker label="Sleep quality" value={sleepQ} onChange={setSleepQ} />
          <EmojiPicker label="Mood" value={mood} onChange={setMood} />
          <button
            onClick={submitCheckin}
            disabled={saving}
            className="w-full mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Log check-in'}
          </button>
        </div>
      )}
    </div>
  )
}
