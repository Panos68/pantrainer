'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { format, parseISO, subDays } from 'date-fns'
import { useState } from 'react'
import type { WeekDoc } from '@/lib/schema'

interface RhrHrvTrendChartProps {
  weeks: WeekDoc[]
}

type RecoveryPoint = {
  date: string
  resting_hr_bpm: number | null
  hrv_overnight_ms: number | null
}

const RANGES = [
  { label: '4W', days: 28 },
  { label: '8W', days: 56 },
  { label: 'ALL', days: null },
] as const

export default function RhrHrvTrendChart({ weeks }: RhrHrvTrendChartProps) {
  const [rangeIdx, setRangeIdx] = useState(0)

  const allPoints: RecoveryPoint[] = weeks
    .flatMap((w) => Object.entries(w.garmin_recovery ?? {}))
    .filter(([, r]) => r.resting_hr_bpm != null || r.hrv_overnight_ms != null)
    .map(([date, r]) => ({
      date,
      resting_hr_bpm: r.resting_hr_bpm ?? null,
      hrv_overnight_ms: r.hrv_overnight_ms ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const range = RANGES[rangeIdx]
  const cutoff = range.days == null ? null : format(subDays(new Date(), range.days), 'yyyy-MM-dd')
  const points = cutoff == null ? allPoints : allPoints.filter((p) => p.date >= cutoff)

  if (allPoints.length === 0) return null

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          RHR &amp; HRV Trend
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block bg-violet-400 rounded" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">RHR (bpm)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 inline-block border-t-2 border-dashed border-cyan-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">HRV (ms)</span>
        </div>
      </div>

      <div className="h-64">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            No recovery data in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'MMM d')}
                tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="rhr"
                orientation="left"
                domain={['auto', 'auto']}
                tick={{ fill: '#a78bfa', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <YAxis
                yAxisId="hrv"
                orientation="right"
                domain={['auto', 'auto']}
                tick={{ fill: '#22d3ee', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as RecoveryPoint
                  return (
                    <div
                      style={{
                        backgroundColor: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 12,
                        fontFamily: 'var(--font-geist-mono)',
                        color: '#e4e4e7',
                        minWidth: 140,
                      }}
                    >
                      <p style={{ color: '#a1a1aa', marginBottom: 6 }}>
                        {format(parseISO(p.date), 'EEE, MMM d')}
                      </p>
                      {p.resting_hr_bpm != null && (
                        <p style={{ color: '#a78bfa', fontWeight: 700 }}>{p.resting_hr_bpm} bpm</p>
                      )}
                      {p.hrv_overnight_ms != null && (
                        <p style={{ color: '#22d3ee', marginTop: 2 }}>{p.hrv_overnight_ms} ms HRV</p>
                      )}
                    </div>
                  )
                }}
              />
              <Line
                yAxisId="rhr"
                type="monotone"
                dataKey="resting_hr_bpm"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: '#a78bfa' }}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#a78bfa' }}
                connectNulls
              />
              <Line
                yAxisId="hrv"
                type="monotone"
                dataKey="hrv_overnight_ms"
                stroke="#22d3ee"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
