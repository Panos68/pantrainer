'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import type { PantryItem } from '@/lib/schema'
import BarcodeScanner, { isBarcodeDetectorAvailable } from '@/components/BarcodeScanner'

// The staple foods the nutrition estimator matches against. Kept deliberately
// short — this is a list of what the athlete actually eats repeatedly, not a
// food database.

const EMPTY_DRAFT = {
  barcode: '',
  name: '',
  aliases: '',
  visualCue: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  usualGrams: '',
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function PantryPage() {
  const [pantry, setPantry] = useState<PantryItem[] | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [addError, setAddError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)

  // BarcodeDetector does not exist during SSR, so the server must render the
  // button as absent and the client fill it in on hydration. useSyncExternalStore
  // is the supported way to read a browser capability without a hydration
  // mismatch or a setState-in-effect.
  const canScan = useSyncExternalStore(
    () => () => {},              // capability never changes; nothing to subscribe to
    isBarcodeDetectorAvailable,  // client
    () => false,                 // server
  )

  const handleScan = useCallback(async (barcode: string) => {
    setScanning(false)
    setAddError(null)

    // A barcode already in the pantry means editing that food, not adding a
    // duplicate under a second slug.
    const existing = pantry?.find((i) => i.barcode === barcode)
    if (existing) {
      setScanNote(`${existing.name} is already in your pantry — edit it above.`)
      return
    }

    setScanNote('Looking up…')
    const res = await fetch(`/api/pantry/lookup?barcode=${encodeURIComponent(barcode)}`)
    const found = await res.json() as {
      found: boolean
      name?: string
      brands?: string
      missingNutriments?: boolean
      per100g?: { calories: number; protein: number; carbs: number; fat: number }
    }

    if (!found.found) {
      setDraft({ ...EMPTY_DRAFT, barcode })
      setScanNote(`Barcode ${barcode} is not in Open Food Facts — fill it in by hand.`)
      return
    }

    if (!found.per100g) {
      setDraft({ ...EMPTY_DRAFT, barcode, name: found.name ?? '' })
      setScanNote(`Found "${found.name}" but it has no nutrition data — read the values off the package.`)
      return
    }

    setDraft({
      barcode,
      name: found.name ?? '',
      aliases: found.name ? found.name.toLowerCase() : '',
      visualCue: '',
      calories: String(found.per100g.calories),
      protein: String(found.per100g.protein),
      carbs: String(found.per100g.carbs),
      fat: String(found.per100g.fat),
      usualGrams: '',
    })
    setScanNote(`Found "${found.name}". Add your usual portion and what it looks like, then save.`)
  }, [pantry])

  const load = useCallback(async () => {
    const res = await fetch('/api/pantry', { cache: 'no-store' })
    const json = await res.json() as { pantry: PantryItem[] }
    setPantry(json.pantry)
  }, [])

  // Fetch in a promise callback rather than awaiting in the effect body —
  // setState directly inside an effect triggers cascading renders.
  useEffect(() => {
    fetch('/api/pantry', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ pantry: PantryItem[] }>)
      .then((json) => setPantry(json.pantry))
      .catch(() => setPantry([]))
  }, [])

  function updateItem(id: string, patch: Partial<PantryItem>) {
    setPantry((prev) => prev?.map((i) => (i._id === id ? { ...i, ...patch } : i)) ?? prev)
  }

  function updateMacro(id: string, key: keyof PantryItem['per100g'], value: number) {
    setPantry((prev) =>
      prev?.map((i) => (i._id === id ? { ...i, per100g: { ...i.per100g, [key]: value } } : i)) ?? prev,
    )
  }

  async function save(item: PantryItem) {
    setSavingId(item._id)
    try {
      // Saving marks the item as the athlete's own number, which clears the
      // "confirm against the package" badge on seeded entries.
      await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, source: 'manual' }),
      })
      await load()
    } finally {
      setSavingId(null)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/pantry?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    await load()
  }

  async function addFood(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    const id = slugify(draft.name)
    if (!id) {
      setAddError('Name is required')
      return
    }
    if (pantry?.some((i) => i._id === id)) {
      setAddError(`"${draft.name}" is already in the pantry`)
      return
    }
    const res = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _id: id,
        name: draft.name.trim(),
        ...(draft.barcode ? { barcode: draft.barcode, source: 'scanned' } : {}),
        aliases: draft.aliases
          .split(',')
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
        visualCue: draft.visualCue.trim(),
        per100g: {
          calories: Number(draft.calories) || 0,
          protein: Number(draft.protein) || 0,
          carbs: Number(draft.carbs) || 0,
          fat: Number(draft.fat) || 0,
        },
        usualGrams: Number(draft.usualGrams) || 0,
      }),
    })
    if (!res.ok) {
      setAddError('Could not save — check the values')
      return
    }
    setDraft(EMPTY_DRAFT)
    await load()
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6 sm:px-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-zinc-50">Pantry</h1>
          <p className="text-zinc-500 text-xs font-mono tracking-widest uppercase">
            Staples the estimator matches against
          </p>
          <p className="text-zinc-600 text-xs font-mono pt-2 leading-relaxed">
            These foods are given to Claude with every food photo, so a tub of kvarg is
            identified as kvarg rather than guessed as milk. The usual portion is the
            anchor when a photo is ambiguous; a clearly different amount is scaled from
            the per-100g values.
          </p>
        </header>

        {pantry === null ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-lime-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {pantry.map((item) => (
              <div
                key={item._id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-zinc-50 text-sm font-bold">{item.name}</p>
                    <p className="text-zinc-600 text-[10px] font-mono truncate">
                      {item.aliases.join(' · ')}
                    </p>
                  </div>
                  {item.source === 'seeded' && (
                    <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-amber-400 border border-amber-400/30 rounded px-1.5 py-0.5">
                      Check label
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {([
                    ['calories', 'kcal'],
                    ['protein', 'P'],
                    ['carbs', 'C'],
                    ['fat', 'F'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">{label}/100g</span>
                      <input
                        type="number"
                        step="0.1"
                        value={item.per100g[key]}
                        onChange={(e) => updateMacro(item._id, key, Number(e.target.value))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Usual g</span>
                    <input
                      type="number"
                      step="1"
                      value={item.usualGrams}
                      onChange={(e) => updateItem(item._id, { usualGrams: Number(e.target.value) })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">What it looks like</span>
                  <textarea
                    value={item.visualCue}
                    onChange={(e) => updateItem(item._id, { visualCue: e.target.value })}
                    rows={2}
                    placeholder="What it looks like — and what it is NOT (e.g. not milk)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 placeholder:text-zinc-700 focus:border-lime-400 focus:outline-none resize-y"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void save(item)}
                    disabled={savingId === item._id}
                    className="text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400 border border-lime-400/30 rounded px-2 py-1 hover:bg-lime-400/10 disabled:opacity-40 transition-colors"
                  >
                    {savingId === item._id ? 'Saving…' : 'Save'}
                  </button>
                  <span className="text-zinc-700 text-[10px] font-mono">
                    usual ≈ {Math.round((item.per100g.calories * item.usualGrams) / 100)} kcal
                  </span>
                  <button
                    onClick={() => (confirmDeleteId === item._id ? void remove(item._id) : setConfirmDeleteId(item._id))}
                    onBlur={() => setConfirmDeleteId(null)}
                    className="ml-auto text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    {confirmDeleteId === item._id ? 'Click again to delete' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addFood} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase">Add food</p>
            {canScan && (
              <button
                type="button"
                onClick={() => { setScanNote(null); setScanning(true) }}
                className="text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400 border border-lime-400/30 rounded px-2 py-1 hover:bg-lime-400/10 transition-colors"
              >
                Scan barcode
              </button>
            )}
          </div>

          {scanNote && <p className="text-zinc-400 text-[10px] font-mono leading-relaxed">{scanNote}</p>}

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
            />
            <input
              placeholder="Aliases, comma separated"
              value={draft.aliases}
              onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
            />
          </div>

          <input
            placeholder="What it looks like — and what it is NOT (e.g. not milk)"
            value={draft.visualCue}
            onChange={(e) => setDraft({ ...draft, visualCue: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
          />

          <div className="grid grid-cols-5 gap-2">
            {([
              ['calories', 'kcal/100g'],
              ['protein', 'P/100g'],
              ['carbs', 'C/100g'],
              ['fat', 'F/100g'],
              ['usualGrams', 'Usual g'],
            ] as const).map(([key, label]) => (
              <input
                key={key}
                type="number"
                step="0.1"
                placeholder={label}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 focus:border-lime-400 focus:outline-none"
              />
            ))}
          </div>

          {addError && <p className="text-red-400 text-[10px] font-mono">{addError}</p>}

          <button
            type="submit"
            className="text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400 border border-lime-400/30 rounded px-3 py-1.5 hover:bg-lime-400/10 transition-colors"
          >
            Add
          </button>
        </form>

        <footer className="flex items-center gap-4 pt-4 border-t border-zinc-800">
          <Link
            href="/"
            className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back
          </Link>
        </footer>

      </div>

      {scanning && (
        <BarcodeScanner
          onDetected={(code) => void handleScan(code)}
          onClose={() => setScanning(false)}
        />
      )}
    </main>
  )
}
