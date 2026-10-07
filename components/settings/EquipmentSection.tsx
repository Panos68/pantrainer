'use client'

import { useEffect, useState } from 'react'
import SectionLabel from './SectionLabel'
import { DEFAULT_PLATE_INVENTORY, type PlateInventory } from '@/lib/plates'

// Bar weight and the plates you own, used for "per side" plate math on the
// live workout screen.
export default function EquipmentSection() {
  const [inventory, setInventory] = useState<PlateInventory>(DEFAULT_PLATE_INVENTORY)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/equipment', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PlateInventory | null) => { if (!cancelled && data) setInventory(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function setPairs(kg: number, pairs: number) {
    setInventory((prev) => ({ ...prev, plates: prev.plates.map((p) => (p.kg === kg ? { ...p, pairs } : p)) }))
  }

  async function save() {
    setStatus('Saving…')
    const res = await fetch('/api/equipment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inventory),
    })
    setStatus(res.ok ? 'Saved' : 'Could not save')
  }

  return (
    <section className="space-y-3">
      <SectionLabel>Equipment</SectionLabel>
      <p className="text-sm text-zinc-500">Your bar and plates — the live workout shows what to load on each side.</p>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3">
        <span className="text-sm">Bar weight</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={inventory.barKg}
            onChange={(e) => setInventory((prev) => ({ ...prev, barKg: Number(e.target.value) || prev.barKg }))}
            className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-right font-mono text-sm"
          />
          <span className="text-xs text-zinc-500">kg</span>
        </span>
      </label>
      <div className="rounded-xl bg-zinc-900 divide-y divide-zinc-800">
        {inventory.plates.map((p) => (
          <label key={p.kg} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm font-mono">{p.kg} kg</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={p.pairs}
                onChange={(e) => setPairs(p.kg, Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))))}
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-right font-mono text-sm"
              />
              <span className="text-xs text-zinc-500">pairs</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="h-9 px-4 rounded-lg bg-lime-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest">
          Save equipment
        </button>
        {status && <span className="text-xs text-zinc-500">{status}</span>}
      </div>
    </section>
  )
}
