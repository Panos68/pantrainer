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

interface ConditioningChartProps {
  weeks: WeekDoc[]
}

interface ConditioningPoint {
  label: string
  date: string
  avg_hr_bpm: number | null
  total_calories: number | null
}

export default function ConditioningChart({ weeks: weekDocs }: ConditioningChartProps) {
  // Collect all conditioning sessions across all weeks, sorted by date
  const points: ConditioningPoint[] = weekDocs
    .flatMap((w) => w.sessions)
    .filter((s) => s.type === 'Conditioning')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      label: format(parseISO(s.date), 'MMM d'),
      date: s.date,
      avg_hr_bpm: s.avg_hr_bpm ?? null,
      total_calories: s.total_calories ?? null,
    }))

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          Conditioning Trend
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 inline-block bg-sky-400 rounded" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Avg HR (bpm)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 inline-block bg-lime-400 rounded" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Calories</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            No conditioning sessions yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              {/* Left Y axis: HR */}
              <YAxis
                yAxisId="hr"
                orientation="left"
                tick={{ fill: '#38bdf8', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={(v) => `${v}`}
              />
              {/* Right Y axis: Calories */}
              <YAxis
                yAxisId="cal"
                orientation="right"
                tick={{ fill: '#a3e635', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-geist-mono)',
                  color: '#e4e4e7',
                }}
                labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                formatter={(value, name) => {
                  if (name === 'avg_hr_bpm') return [`${value} bpm`, 'Avg HR']
                  if (name === 'total_calories') return [`${value} kcal`, 'Calories']
                  return [`${value}`, String(name)]
                }}
              />
              <Line
                yAxisId="hr"
                type="monotone"
                dataKey="avg_hr_bpm"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ fill: '#38bdf8', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                yAxisId="cal"
                type="monotone"
                dataKey="total_calories"
                stroke="#a3e635"
                strokeWidth={2}
                dot={{ fill: '#a3e635', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
