'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type LiftRow = { key: string; value: string }

const DEFAULT_PROFILE = {
  name: 'Panos',
  age: '33',
  weight_kg: '73.7',
  smm_kg: '35.2',
  bf_pct: '15.6',
  bmr_kcal: '1713',
  rhr_bpm: '43',
  smm_target_kg: '37',
}

const DEFAULT_LIFTS: LiftRow[] = [
  { key: 'bench_press_kg', value: '70' },
  { key: 'bench_status', value: 'current ceiling with pause' },
  { key: 'deadlift_kg', value: '95' },
  { key: 'deadlift_next', value: '100' },
  { key: 'weighted_pullups_added_kg', value: '5' },
  { key: 'pullup_status', value: 'full ROM priority' },
  { key: 'pendlay_row_kg', value: '50' },
  { key: 'pendlay_status', value: 'technique focus' },
  { key: 'chest_supported_row_kg', value: '15' },
  { key: 'incline_db_kg', value: '22.5' },
  { key: 'incline_db_next', value: '24' },
  { key: 'lateral_raise_kg', value: '8' },
  { key: 'push_press_kg', value: '40' },
  { key: 'weighted_dips_kg', value: '12.5' },
  { key: 'sunday_db_bench_kg', value: '20' },
  { key: 'sunday_cable_row_kg', value: '65' },
  { key: 'sunday_hammer_curl_kg', value: '15' },
  { key: 'sunday_pushdown_kg', value: '20' },
  { key: 'sunday_face_pull_kg', value: '12.5' },
]

export default function SetupPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [lifts, setLifts] = useState<LiftRow[]>(DEFAULT_LIFTS)

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((data) => {
        if (data.complete) {
          router.replace('/')
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [router])

  function updateProfile(field: keyof typeof DEFAULT_PROFILE, value: string) {
    setProfile((p) => ({ ...p, [field]: value }))
  }

  function updateLift(index: number, field: 'key' | 'value', value: string) {
    setLifts((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  function addLift() {
    setLifts((rows) => [...rows, { key: '', value: '' }])
  }

  function removeLift(index: number) {
    setLifts((rows) => rows.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const liftProgression: Record<string, string | number> = {}
    for (const { key, value } of lifts) {
      if (!key.trim()) continue
      const num = Number(value)
      liftProgression[key.trim()] = isNaN(num) || value.trim() === '' ? value : num
    }

    const payload = {
      name: profile.name,
      age: Number(profile.age),
      weight_kg: Number(profile.weight_kg),
      smm_kg: Number(profile.smm_kg),
      bf_pct: Number(profile.bf_pct),
      bmr_kcal: Number(profile.bmr_kcal),
      rhr_bpm: Number(profile.rhr_bpm),
      smm_target_kg: Number(profile.smm_target_kg),
      lift_progression: liftProgression,
    }

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? 'Failed to save profile')
      }
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm tracking-widest uppercase">Loading…</p>
      </div>
    )
  }

  const profileFields: { label: string; key: keyof typeof DEFAULT_PROFILE; type: string; step?: string }[] = [
    { label: 'Name', key: 'name', type: 'text' },
    { label: 'Age', key: 'age', type: 'number' },
    { label: 'Weight (kg)', key: 'weight_kg', type: 'number', step: '0.1' },
    { label: 'SMM (kg)', key: 'smm_kg', type: 'number', step: '0.1' },
    { label: 'Body Fat (%)', key: 'bf_pct', type: 'number', step: '0.1' },
    { label: 'BMR (kcal)', key: 'bmr_kcal', type: 'number' },
    { label: 'Baseline RHR (BPM)', key: 'rhr_bpm', type: 'number' },
    { label: 'SMM Target (kg)', key: 'smm_target_kg', type: 'number', step: '0.1' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <p className="text-lime-400 text-xs font-bold tracking-[0.3em] uppercase mb-3">
            PanTrainer
          </p>
          <h1 className="text-4xl font-black tracking-tight text-zinc-50 uppercase leading-none">
            Setup Your<br />Profile
          </h1>
          <p className="text-zinc-500 mt-3 text-sm">
            Configure your athlete profile and baseline lift weights to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Athlete Profile */}
          <Card className="bg-zinc-900 border-0 ring-1 ring-zinc-800">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="text-zinc-50 font-bold text-base tracking-wide uppercase">
                Athlete Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profileFields.map(({ label, key, type, step }) => (
                  <div key={key} className={key === 'name' ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                      {label}
                    </label>
                    <Input
                      type={type}
                      step={step}
                      value={profile[key]}
                      onChange={(e) => updateProfile(key, e.target.value)}
                      required
                      className="bg-zinc-800 border-zinc-700 text-zinc-50 placeholder:text-zinc-600 focus-visible:border-lime-400 focus-visible:ring-lime-400/20 h-9"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Baseline Lift Weights */}
          <Card className="bg-zinc-900 border-0 ring-1 ring-zinc-800">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-zinc-50 font-bold text-base tracking-wide uppercase">
                  Baseline Lift Weights
                </CardTitle>
                <button
                  type="button"
                  onClick={addLift}
                  className="text-xs font-semibold text-lime-400 hover:text-lime-300 tracking-wide uppercase transition-colors"
                >
                  + Add Row
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lift</span>
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Value</span>
                  <span className="w-6" />
                </div>
                {lifts.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateLift(i, 'key', e.target.value)}
                      placeholder="lift_name"
                      className="bg-zinc-800 border-zinc-700 text-zinc-50 placeholder:text-zinc-600 focus-visible:border-lime-400 focus-visible:ring-lime-400/20 h-8 text-xs font-mono"
                    />
                    <Input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateLift(i, 'value', e.target.value)}
                      placeholder="value"
                      className="bg-zinc-800 border-zinc-700 text-zinc-50 placeholder:text-zinc-600 focus-visible:border-lime-400 focus-visible:ring-lime-400/20 h-8 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeLift(i)}
                      className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors rounded"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2 border border-red-400/20">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save & Start Training'}
          </button>
        </form>
      </div>
    </div>
  )
}
