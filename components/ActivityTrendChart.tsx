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
import { format, parseISO } from 'date-fns'
import type { WeekDoc } from '@/lib/schema'
import { sessionToLoadPoint, type AthleteLoadParams, type TrainingLoadPoint } from '@/lib/training-load'

interface ActivityTrendChartProps {
  weeks: WeekDoc[]
  athlete?: AthleteLoadParams
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
  const points: TrainingLoadPoint[] = weeks
    .flatMap((w) => w.sessions)
    .map((s) => sessionToLoadPoint(s, athlete))
    .filter((p): p is TrainingLoadPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const presentTypes = [...new Set(points.map((p) => p.type))]

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          Activity Trend
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
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
            <span className="w-4 h-0.5 inline-block bg-lime-400 rounded" />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Load</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 inline-block border-t border-dashed border-sky-400" />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Avg HR</span>
          </div>
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
              {/* Right Y: avg HR */}
              <YAxis
                yAxisId="hr"
                orientation="right"
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
                      <p style={{ marginBottom: 2 }}>❤️ {p.avg_hr_bpm} bpm</p>
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
              {/* Training load — solid, type-colored dots */}
              <Line
                yAxisId="load"
                type="monotone"
                dataKey="training_load"
                stroke="#a3e635"
                strokeWidth={2}
                dot={<TypeDot />}
                activeDot={{ r: 6, strokeWidth: 0, fill: '#a3e635' }}
                connectNulls
              />
              {/* Avg HR — dashed, no dots */}
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
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
