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

interface GarminData {
  sleep_hours: number | null
  resting_hr_bpm: number | null
}

export interface ReadinessApiResponse {
  date: string
  score: ScoreBreakdown
  readiness: ReadinessData | null
  sleep_avg_7d: number | null
  has_garmin_sleep: boolean
  garmin: GarminData | null
}

const EMOJI_SCALE = ['😴', '😕', '😐', '🙂', '⚡']

const COLOR = {
  green: { score: 'text-emerald-400', label: 'text-emerald-400', border: 'border-emerald-900', ring: '#34d399', glow: 'rgba(52,211,153,0.06)' },
  amber: { score: 'text-amber-400',   label: 'text-amber-400',   border: 'border-amber-900',   ring: '#fbbf24', glow: 'rgba(251,191,36,0.06)' },
  red:   { score: 'text-red-400',     label: 'text-red-400',     border: 'border-red-900',     ring: '#f87171', glow: 'rgba(248,113,113,0.06)' },
}

const BAR_COLORS = {
  sleep:      'bg-sky-400',
  rhr:        'bg-violet-400',
  load:       'bg-amber-400',
  subjective: 'bg-emerald-400',
}

function cacheKey(date: string) { return `readiness-cache-${date}` }

export function getReadinessCache(date: string): ReadinessApiResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey(date))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setReadinessCache(date: string, data: ReadinessApiResponse) {
  try { localStorage.setItem(cacheKey(date), JSON.stringify(data)) } catch { /* noop */ }
}

function clearReadinessCache(date: string) {
  try { localStorage.removeItem(cacheKey(date)) } catch { /* noop */ }
}

async function fetchReadiness(date: string, cacheBust = false): Promise<ReadinessApiResponse> {
  const suffix = cacheBust ? `&_ts=${Date.now()}` : ''
  const res = await fetch(`/api/readiness?date=${date}${suffix}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Readiness fetch failed (${res.status})`)
  return res.json() as Promise<ReadinessApiResponse>
}


function ScoreRing({ total, color }: { total: number; color: 'green' | 'amber' | 'red' }) {
  const radius = 44
  const stroke = 5
  const size = (radius + stroke) * 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (total / 100) * circumference
  const ringColor = COLOR[color].ring

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

function BreakdownBar({
  label,
  value,
  max,
  unavailable,
  barColor,
}: {
  label: string
  value: number
  max: number
  unavailable?: boolean
  barColor: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-[11px] w-14 shrink-0">{label}</span>
      {unavailable ? (
        <>
          <div className="flex-1 h-2 bg-zinc-800 rounded-full" />
          <span className="text-zinc-600 text-[11px] font-mono font-bold w-10 text-right">—</span>
        </>
      ) : (
        <>
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.round((value / max) * 100)}%` }}
            />
          </div>
          <span className="text-zinc-400 text-[11px] font-mono font-bold w-10 text-right">{value}/{max}</span>
        </>
      )}
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
  const [data, setData] = useState<ReadinessApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [energy, setEnergy] = useState(3)
  const [sleepQ, setSleepQ] = useState(3)
  const [mood, setMood] = useState(3)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const cached = getReadinessCache(today)
        if (cached?.has_garmin_sleep) {
          setData(cached)
          if (!cached.readiness) setCheckinOpen(true)
          return
        }

        let d = await fetchReadiness(today)
        if (!d.has_garmin_sleep) {
          // Don't block rendering waiting for Garmin — show what we have immediately.
          // Sleep gets populated by the workout page's Garmin sync and will appear on
          // the next home load or after cache invalidation.
          fetch('/api/garmin/recovery', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: today }),
          }).then(() => fetchReadiness(today, true)).then((fresh) => {
            if (fresh.has_garmin_sleep) {
              setReadinessCache(today, fresh)
              setData(fresh)
            }
          }).catch(() => {})
        }
        setReadinessCache(today, d)
        setData(d)
        if (!d.readiness) setCheckinOpen(true)
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
    setSaveError(null)
    try {
      const saveRes = await fetch('/api/readiness', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, energy_level: energy, sleep_quality: sleepQ, mood }),
      })
      if (!saveRes.ok) {
        throw new Error(`Check-in save failed (${saveRes.status})`)
      }
      // Use the readiness the server just persisted — no need to poll a potentially
      // stale cache. Merge into current data so score/garmin fields stay intact.
      const { readiness } = await saveRes.json()
      clearReadinessCache(today)
      const updated = data ? { ...data, readiness } : null
      if (updated) {
        setReadinessCache(today, updated)
        setData(updated)
      }
      setCheckinOpen(false)
      // Background refresh to recompute the recovery score with the new readiness
      fetchReadiness(today, true).then((fresh) => {
        setReadinessCache(today, fresh)
        setData(fresh)
      }).catch(() => {})
    } catch {
      setSaveError('Save failed. Please try once more.')
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

  const { score, garmin } = data
  const noSleep = !garmin || garmin.sleep_hours == null
  const noRhr = !garmin || garmin.resting_hr_bpm == null
  const c = COLOR[score.color]
  const ringSize = (44 + 5) * 2

  return (
    <div
      className={`border ${c.border} rounded-xl p-3 overflow-hidden`}
      style={{ background: `radial-gradient(ellipse 60% 80% at 95% 50%, ${c.glow} 0%, transparent 60%), #18181b` }}
    >
      <div className="flex items-center gap-4">
        {/* Breakdown bars — fill available space */}
        <div className="flex-1 min-w-0 space-y-2">
          <BreakdownBar label="Sleep" value={score.sleep} max={40} unavailable={noSleep} barColor={BAR_COLORS.sleep} />
          {data.sleep_avg_7d != null && (
            <p className="text-[10px] text-zinc-600 pl-16 -mt-1">7d avg {data.sleep_avg_7d}h</p>
          )}
          <BreakdownBar label="RHR" value={score.rhr} max={30} unavailable={noRhr} barColor={BAR_COLORS.rhr} />
          <BreakdownBar label="Load" value={score.load} max={20} barColor={BAR_COLORS.load} />
          <BreakdownBar label="Feeling" value={score.subjective} max={10} barColor={BAR_COLORS.subjective} />
        </div>

        {/* Score ring + label — anchored right */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mb-0.5">Recovery</p>
            <p className={`text-xl font-black uppercase tracking-tight ${c.label}`}>{score.label}</p>
            {!data.readiness && !checkinOpen && (
              <button
                onClick={() => setCheckinOpen(true)}
                className="mt-1.5 text-[10px] text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5 hover:border-zinc-500 transition-colors"
              >
                Add check-in
              </button>
            )}
          </div>
          <div
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: ringSize, height: ringSize }}
          >
            <ScoreRing total={score.total} color={score.color} />
            <div className="flex flex-col items-center">
              <span className={`text-4xl font-black leading-none ${c.score}`}>{score.total}</span>
              <span className="text-zinc-600 text-[10px] font-mono">/100</span>
            </div>
          </div>
        </div>
      </div>

      {checkinOpen && (
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <p className="text-zinc-400 text-xs uppercase tracking-widest">How are you feeling?</p>
          <EmojiPicker label="Energy" value={energy} onChange={setEnergy} />
          <EmojiPicker label="Sleep quality" value={sleepQ} onChange={setSleepQ} />
          <EmojiPicker label="Mood" value={mood} onChange={setMood} />
          {saveError && (
            <p className="text-red-400 text-xs">{saveError}</p>
          )}
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
