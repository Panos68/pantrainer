'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { WeekDoc } from '@/lib/schema'

interface LiftProgressChartProps {
  weeks: WeekDoc[]
}

const LIFTS = [
  { key: 'bench_press_kg', label: 'Bench Press', color: '#a3e635' },       // lime-400
  { key: 'deadlift_kg', label: 'Deadlift', color: '#38bdf8' },             // sky-400
  { key: 'push_press_kg', label: 'OHP / Push Press', color: '#a78bfa' },   // violet-400
  { key: 'weighted_pullups_added_kg', label: 'Pull-ups +kg', color: '#fbbf24' }, // amber-400
] as const

type LiftKey = (typeof LIFTS)[number]['key']

function parseWeight(val: string | number | null | undefined): number | null {
  if (val == null) return null
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return isNaN(n) ? null : n
}

function shortWeekLabel(weekStr: string): string {
  // "Apr 14–20, 2026" → "Apr 14–20"
  const match = weekStr.match(/^(\w+ \d+[–-]\d+)/)
  return match ? match[1] : weekStr
}

interface ChartPoint {
  label: string
  bench_press_kg?: number | null
  deadlift_kg?: number | null
  push_press_kg?: number | null
  weighted_pullups_added_kg?: number | null
}

export default function LiftProgressChart({ weeks }: LiftProgressChartProps) {
  const [visibleLifts, setVisibleLifts] = useState<Set<LiftKey>>(
    new Set(LIFTS.map((l) => l.key))
  )

  function toggleLift(key: LiftKey) {
    setVisibleLifts((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const data: ChartPoint[] = weeks.map((w) => ({
    label: shortWeekLabel(w.week),
    bench_press_kg: parseWeight(w.lift_progression['bench_press_kg']),
    deadlift_kg: parseWeight(w.lift_progression['deadlift_kg']),
    push_press_kg: parseWeight(w.lift_progression['push_press_kg']),
    weighted_pullups_added_kg: parseWeight(w.lift_progression['weighted_pullups_added_kg']),
  }))

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          Lift Progression
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-2">
        {LIFTS.map((lift) => {
          const active = visibleLifts.has(lift.key)
          return (
            <button
              key={lift.key}
              onClick={() => toggleLift(lift.key)}
              className="px-3 h-7 rounded-md text-xs font-mono font-bold tracking-widest uppercase transition-all"
              style={{
                backgroundColor: active ? lift.color + '22' : 'transparent',
                color: active ? lift.color : '#52525b',
                border: `1px solid ${active ? lift.color + '55' : '#3f3f46'}`,
              }}
            >
              {lift.label}
            </button>
          )
        })}
      </div>

      {/* Chart */}
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
                axisLine={false}
                tickLine={false}
                width={36}
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
                  const lift = LIFTS.find((l) => l.key === name)
                  return [`${value} kg`, lift?.label ?? String(name)]
                }}
              />
              {LIFTS.map((lift) =>
                visibleLifts.has(lift.key) ? (
                  <Line
                    key={lift.key}
                    type="monotone"
                    dataKey={lift.key}
                    stroke={lift.color}
                    strokeWidth={2}
                    dot={{ fill: lift.color, r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
