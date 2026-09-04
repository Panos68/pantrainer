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

interface WeightTrendChartProps {
  weeks: WeekDoc[]
}

type WeightPoint = {
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
}

const RANGES = [
  { label: '4W', days: 28 },
  { label: '8W', days: 56 },
  { label: 'ALL', days: null },
] as const

export default function WeightTrendChart({ weeks }: WeightTrendChartProps) {
  const [rangeIdx, setRangeIdx] = useState(0)

  const allPoints: WeightPoint[] = weeks
    .flatMap((w) => Object.entries(w.renpho_measurements ?? {}))
    .filter(([, m]) => m.weight_kg != null)
    .map(([date, m]) => ({
      date,
      weight_kg: m.weight_kg ?? null,
      body_fat_pct: m.body_fat_pct ?? null,
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
          Weight Trend
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
          <span className="w-4 h-0.5 inline-block bg-sky-400 rounded" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Weight (kg)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 inline-block border-t-2 border-dashed border-amber-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Body Fat %</span>
        </div>
      </div>

      <div className="h-64">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            No weight data in this range
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
                yAxisId="weight"
                orientation="left"
                domain={['dataMin - 1', 'dataMax + 1']}
                tick={{ fill: '#38bdf8', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <YAxis
                yAxisId="bodyfat"
                orientation="right"
                tick={{ fill: '#fbbf24', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as WeightPoint
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
                      <p style={{ color: '#38bdf8', fontWeight: 700 }}>{p.weight_kg} kg</p>
                      {p.body_fat_pct != null && (
                        <p style={{ color: '#fbbf24', marginTop: 2 }}>{p.body_fat_pct}% body fat</p>
                      )}
                    </div>
                  )
                }}
              />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weight_kg"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: '#38bdf8' }}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#38bdf8' }}
                connectNulls
              />
              <Line
                yAxisId="bodyfat"
                type="monotone"
                dataKey="body_fat_pct"
                stroke="#fbbf24"
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
