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
import { sessionToLoadPoint, type AthleteLoadParams, type TrainingLoadPoint } from '@/lib/training-load'

interface ActivityTrendChartProps {
  weeks: WeekDoc[]
  athlete?: AthleteLoadParams
}

const RANGES = [
  { label: '4W', days: 28 },
  { label: '8W', days: 56 },
  { label: 'ALL', days: null },
] as const

// 7-day trailing rolling average of training_load, keyed by date.
function withRollingAvg(points: TrainingLoadPoint[]): (TrainingLoadPoint & { load_avg7: number | null })[] {
  const dailyLoad = new Map<string, number>()
  for (const p of points) {
    dailyLoad.set(p.date, (dailyLoad.get(p.date) ?? 0) + p.training_load)
  }
  return points.map((p) => {
    const windowStart = format(subDays(parseISO(p.date), 6), 'yyyy-MM-dd')
    let sum = 0
    let count = 0
    for (const [date, load] of dailyLoad) {
      if (date >= windowStart && date <= p.date) {
        sum += load
        count++
      }
    }
    return { ...p, load_avg7: count > 0 ? Math.round((sum / 7) * 10) / 10 : null }
  })
}

const TYPE_COLORS: Record<string, string> = {
  Conditioning: '#38bdf8', // sky-400
  Strength:     '#a78bfa', // violet-400
  Recovery:     '#34d399', // emerald-400
  Rest:         '#71717a', // zinc-500
}

function typeDotColor(type: string): string {
  return TYPE_COLORS[type] ?? '#71717a'
}

// Custom dot on the load line — colored by session type
function TypeDot(props: { cx?: number; cy?: number; payload?: TrainingLoadPoint }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || payload == null) return null
  return <circle cx={cx} cy={cy} r={4} fill={typeDotColor(payload.type)} stroke="none" />
}

export default function ActivityTrendChart({ weeks, athlete }: ActivityTrendChartProps) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const [showHr, setShowHr] = useState(false)

  const allPoints: TrainingLoadPoint[] = weeks
    .flatMap((w) => w.sessions)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is TrainingLoadPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Rolling average is computed over full history so early points in the window still have context.
  const withAvg = withRollingAvg(allPoints)

  const range = RANGES[rangeIdx]
  const cutoff = range.days == null ? null : format(subDays(new Date(), range.days), 'yyyy-MM-dd')
  const points = cutoff == null ? withAvg : withAvg.filter((p) => p.date >= cutoff)

  const presentTypes = [...new Set(points.map((p) => p.type))]

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          Activity Trend
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
        {presentTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: typeDotColor(type) }}
            />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 inline-block bg-amber-400 rounded" />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Load (7d avg)</span>
          </div>
          <button
            onClick={() => setShowHr((v) => !v)}
            className={`text-xs font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${
              showHr ? 'text-sky-400 bg-sky-400/10' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            Show HR
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            No sessions yet
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
              {/* Left Y: training load */}
              <YAxis
                yAxisId="load"
                orientation="left"
                tick={{ fill: '#a3e635', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
              />
              {/* Right Y: avg HR — hidden until toggled on */}
              <YAxis
                yAxisId="hr"
                orientation="right"
                hide={!showHr}
                tick={{ fill: '#38bdf8', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as TrainingLoadPoint
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
                        minWidth: 180,
                      }}
                    >
                      <p style={{ color: '#a1a1aa', marginBottom: 6 }}>
                        {format(parseISO(p.date), 'EEE, MMM d')}
                      </p>
                      <p style={{ color: typeDotColor(p.type), marginBottom: 6, fontWeight: 700 }}>
                        {p.type}{p.subtype ? ` · ${p.subtype}` : ''}
                      </p>
                      <p style={{ marginBottom: 2 }}>⏱ {p.duration_min} min</p>
                      {p.avg_hr_bpm != null && (
                        <p style={{ marginBottom: 2 }}>❤️ {p.avg_hr_bpm} bpm</p>
                      )}
                      {p.total_calories != null && (
                        <p style={{ marginBottom: 2 }}>🔥 {p.total_calories} kcal</p>
                      )}
                      <p style={{ color: '#a3e635', marginTop: 6 }}>
                        Load: {p.training_load.toLocaleString()}
                        <span style={{ color: '#52525b', fontSize: 10, marginLeft: 4 }}>
                          ({p.load_source === 'garmin_tss' ? 'Garmin TSS' : p.load_source === 'trimp' ? 'TRIMP' : 'HR×min'})
                        </span>
                      </p>
                    </div>
                  )
                }}
              />
              {/* Raw daily load — faint line, always-visible type-colored dots */}
              <Line
                yAxisId="load"
                type="monotone"
                dataKey="training_load"
                stroke="#3f3f46"
                strokeWidth={1}
                dot={<TypeDot />}
                activeDot={{ r: 6, strokeWidth: 0, fill: '#a3e635' }}
                connectNulls
              />
              {/* 7-day rolling avg load — bold primary trend line */}
              <Line
                yAxisId="load"
                type="monotone"
                dataKey="load_avg7"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#fbbf24' }}
                connectNulls
              />
              {/* Avg HR — dashed, only rendered when toggled on */}
              {showHr && (
                <Line
                  yAxisId="hr"
                  type="monotone"
                  dataKey="avg_hr_bpm"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
