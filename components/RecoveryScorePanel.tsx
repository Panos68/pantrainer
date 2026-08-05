'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useCountUp } from '@/lib/useCountUp'
import type { ReadinessSnapshot } from '@/lib/readiness'

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

async function fetchReadiness(date: string, cacheBust = false): Promise<ReadinessSnapshot> {
  const suffix = cacheBust ? `&_ts=${Date.now()}` : ''
  const res = await fetch(`/api/readiness?date=${date}${suffix}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Readiness fetch failed (${res.status})`)
  return res.json() as Promise<ReadinessSnapshot>
}

function ScoreRing({ total, color }: { total: number; color: 'green' | 'amber' | 'red' }) {
  const prefersReducedMotion = useReducedMotion()
  const radius = 64
  const stroke = 7
  const size = (radius + stroke) * 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (total / 100) * circumference
  const ringColor = COLOR[color].ring

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 w-full h-full -rotate-90"
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
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeLinecap="round"
        initial={{ strokeDashoffset: prefersReducedMotion ? offset : circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  )
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="w-9 shrink-0" />
  const positive = delta >= 0
  return (
    <span
      className={`text-[10px] font-mono font-bold px-1 rounded w-9 text-center shrink-0 ${
        positive ? 'bg-emerald-400 text-emerald-950' : 'bg-amber-400 text-amber-950'
      }`}
    >
      {positive ? '+' : ''}
      {delta}
    </span>
  )
}

function BreakdownBar({
  label,
  value,
  max,
  unavailable,
  barColor,
  baseline,
}: {
  label: string
  value: number
  max: number
  unavailable?: boolean
  barColor: string
  baseline: number | null
}) {
  const delta = unavailable || baseline == null ? null : value - baseline
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-[11px] w-14 shrink-0">{label}</span>
        <DeltaBadge delta={delta} />
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
      {!unavailable && (
        <p className="text-[9px] text-zinc-600 pl-[92px] -mt-0.5">
          baseline {baseline != null ? `${baseline}/${max}` : '—'}
        </p>
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

export default function RecoveryScorePanel({ today, initialData }: { today: string; initialData: ReadinessSnapshot }) {
  const [data, setData] = useState<ReadinessSnapshot>(initialData)
  const [checkinOpen, setCheckinOpen] = useState(!initialData.readiness)
  const [energy, setEnergy] = useState(3)
  const [sleepQ, setSleepQ] = useState(3)
  const [mood, setMood] = useState(3)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const displayScore = useCountUp(data.score.total)

  useEffect(() => {
    if (initialData.has_garmin_sleep) return
    // Don't block rendering waiting for Garmin — server-rendered initial data is
    // already shown. Sleep gets populated by this background sync and appears
    // once it resolves, or on the next full page load.
    fetch('/api/garmin/recovery', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today }),
    }).then(() => fetchReadiness(today, true)).then((fresh) => {
      if (fresh.has_garmin_sleep) setData(fresh)
    }).catch(() => {})
    // Only re-run this sync if the day itself changes, not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { readiness } = await saveRes.json()
      setData((d) => ({ ...d, readiness }))
      setCheckinOpen(false)
      // Background refresh to recompute the recovery score with the new readiness
      fetchReadiness(today, true).then(setData).catch(() => {})
    } catch {
      setSaveError('Save failed. Please try once more.')
    } finally {
      setSaving(false)
    }
  }

  const { score, garmin, baseline } = data
  const noSleep = !garmin || garmin.sleep_hours == null
  const noRhr = !garmin || garmin.resting_hr_bpm == null
  const c = COLOR[score.color]
  const netDelta = baseline.total != null ? score.total - baseline.total : null

  return (
    <div
      className="w-full md:flex-1 relative overflow-hidden rounded-xl p-3"
      style={{ background: `radial-gradient(ellipse 60% 80% at 95% 50%, ${c.glow} 0%, transparent 60%)` }}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Breakdown bars — fill available space */}
        <div className="flex-1 min-w-0 space-y-2">
          <BreakdownBar label="Sleep" value={score.sleep} max={40} unavailable={noSleep} barColor={BAR_COLORS.sleep} baseline={baseline.sleep} />
          <BreakdownBar label="RHR" value={score.rhr} max={30} unavailable={noRhr} barColor={BAR_COLORS.rhr} baseline={baseline.rhr} />
          <BreakdownBar label="Load" value={score.load} max={20} barColor={BAR_COLORS.load} baseline={baseline.load} />
          <BreakdownBar label="Feeling" value={score.subjective} max={10} barColor={BAR_COLORS.subjective} baseline={baseline.subjective} />
        </div>

        {/* Score ring + label — anchored right; label sits under the ring on mobile, beside it from sm: up */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-1 sm:gap-3 shrink-0">
          <div className="text-center sm:text-right">
            <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mb-0.5 hidden sm:block">Recovery</p>
            <p className={`text-xs sm:text-2xl font-black uppercase tracking-tight ${c.label}`}>{score.label}</p>
            {netDelta != null && (
              <p className="text-zinc-600 text-[9px] sm:text-[10px] mt-0.5 whitespace-nowrap">
                Net {netDelta >= 0 ? '+' : ''}{netDelta} vs 7d
              </p>
            )}
            {!data.readiness && !checkinOpen && (
              <button
                onClick={() => setCheckinOpen(true)}
                className="mt-1 sm:mt-1.5 text-[10px] text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5 hover:border-zinc-500 transition-colors"
              >
                Add check-in
              </button>
            )}
          </div>
          <div className="relative shrink-0 flex items-center justify-center w-20 h-20 sm:w-36 sm:h-36">
            <ScoreRing total={score.total} color={score.color} />
            <div className="flex flex-col items-center">
              <span className={`font-display font-bold text-2xl sm:text-7xl leading-none tabular-nums ${c.score}`}>{displayScore}</span>
              <span className="text-zinc-600 text-[8px] sm:text-[10px] font-mono">/100</span>
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
