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

interface Props {
  data: PmcPoint[]
}

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
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-zinc-500 text-xs font-mono">Not enough training history for Performance Management Chart.</p>
      </div>
    )
  }

  const formatted = data.map((p) => ({
    ...p,
    label: format(parseISO(p.date), 'MMM d'),
  }))

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Performance Management</p>
        <div className="flex gap-3 text-[10px] font-mono">
          <span className="text-blue-400">CTL fitness</span>
          <span className="text-rose-400">ATL fatigue</span>
          <span className="text-lime-400">TSB form</span>
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
            tick={{ fill: '#52525b', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="ctl" name="CTL" stroke="#60a5fa" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="atl" name="ATL" stroke="#f87171" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="tsb" name="TSB" stroke="#a3e635" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] font-mono text-zinc-600">
        TSB &gt; 0 = fresh · TSB &lt; −10 = accumulated fatigue · TSB &lt; −30 = overreaching
      </p>
    </div>
  )
}
