'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { PmcPoint } from '@/lib/pmc'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'

interface Props {
  data: PmcPoint[]
}

const RANGES = [
  { label: '4W', days: 28 },
  { label: '8W', days: 56 },
  { label: 'ALL', days: null },
] as const

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono space-y-1">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

export default function PmcChart({ data }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0)

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-zinc-500 text-xs font-mono">Not enough training history for Performance Management Chart.</p>
      </div>
    )
  }

  const range = RANGES[rangeIdx]
  const windowed = range.days == null ? data : data.slice(-range.days)

  const formatted = windowed.map((p) => ({
    ...p,
    label: format(parseISO(p.date), 'MMM d'),
  }))

  const latest = formatted[formatted.length - 1]

  const badges: Array<{ name: string; value: string; bg: string }> = [
    { name: 'CTL', value: latest.ctl.toFixed(0), bg: '#60a5fa' },
    { name: 'ATL', value: latest.atl.toFixed(0), bg: '#f87171' },
    { name: 'TSB', value: latest.tsb.toFixed(0), bg: '#a3e635' },
    { name: 'ACWR', value: latest.acwr != null ? latest.acwr.toFixed(2) : '—', bg: '#fbbf24' },
  ]

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Performance Management</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {badges.map((b) => (
              <span
                key={b.name}
                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-zinc-950"
                style={{ backgroundColor: b.bg }}
              >
                {b.name} {b.value}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  i === rangeIdx ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#52525b', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="load"
            tick={{ fill: '#52525b', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="acwr"
            orientation="right"
            domain={[0, 2]}
            tick={{ fill: '#fbbf24', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="load" y={0} stroke="#3f3f46" strokeDasharray="3 3" />
          <Line yAxisId="load" type="monotone" dataKey="ctl" name="CTL" stroke="#60a5fa" dot={false} strokeWidth={2} />
          <Line yAxisId="load" type="monotone" dataKey="atl" name="ATL" stroke="#f87171" dot={false} strokeWidth={2} />
          <Line yAxisId="load" type="monotone" dataKey="tsb" name="TSB" stroke="#a3e635" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          <Line yAxisId="acwr" type="monotone" dataKey="acwr" name="ACWR" stroke="#fbbf24" dot={false} strokeWidth={1.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] font-mono text-zinc-600">
        CTL/ATL/TSB are a rough trend guide, not a precise threshold — the fresh/overreaching cutoffs come from cycling power-based TSS and do not calibrate cleanly to session-RPE-scored strength/conditioning training. ACWR 0.8–1.3 = optimal.
      </p>
    </div>
  )
}
