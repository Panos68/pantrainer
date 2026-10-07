'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { E1rmPoint, TrackedLift } from '@/lib/strength'

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function E1rmChart({ lifts, history }: { lifts: TrackedLift[]; history: Record<string, E1rmPoint[]> }) {
  const [selected, setSelected] = useState(lifts[0]?.key ?? '')
  const points = (history[selected] ?? []).map((p) => ({ ...p, label: shortDate(p.date) }))

  return (
    <div className="bg-zinc-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">Estimated 1RM</h2>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>
      {lifts.length === 0 ? (
        <p className="text-zinc-600 text-sm font-mono">Log a lift in two sessions to see its curve.</p>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 max-w-full"
          >
            {lifts.map((l) => (
              <option key={l.key} value={l.key}>{l.name} · {l.sessions} sessions</option>
            ))}
          </select>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12, color: '#e4e4e7' }}
                  formatter={(value, _name, item) => {
                    const p = item.payload as E1rmPoint
                    return [`${value} kg (from ${p.weight} × ${p.reps})`, 'e1RM']
                  }}
                />
                <Line type="monotone" dataKey="e1rm" stroke="#a3e635" strokeWidth={2} dot={{ r: 3, fill: '#a3e635', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-zinc-600 font-mono">Best set of each day, estimated with Epley (sets of 12 reps or fewer). Excluded sessions are left out.</p>
        </>
      )}
    </div>
  )
}
