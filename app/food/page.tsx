'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BarcodeScanner, { isBarcodeDetectorAvailable } from '@/components/BarcodeScanner'
import ExpiryScanner from '@/components/ExpiryScanner'
import type { FoodInventoryItem, FoodLocation } from '@/lib/schema'

const LOCATIONS: Array<{ value: FoodLocation; label: string }> = [
  { value: 'fridge', label: '🧊 Fridge' },
  { value: 'freezer', label: '❄️ Freezer' },
  { value: 'cupboard', label: '🥫 Cupboard' },
]

const LOCATION_LABEL: Record<FoodLocation, string> = {
  fridge: '🧊 Fridge', freezer: '❄️ Freezer', cupboard: '🥫 Cupboard',
}

type LocationTab = FoodLocation | 'all'
type SortBy = 'name' | 'added' | 'expiry'

const SORTS: Array<{ value: SortBy; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Recently Added' },
  { value: 'expiry', label: 'Expiry' },
]

// Only items whose quantity is a plain count ("3 items") get a +/- stepper —
// free-text quantities like "500g" or "2 packs" keep the old text until
// edited, since incrementing them wouldn't mean anything.
function parseCount(quantity: string): number | null {
  const match = quantity.match(/^(\d+)\s*items?$/i)
  return match ? parseInt(match[1], 10) : null
}

function formatCount(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`
}

function expiryLabel(expiresOn: string | null): { text: string; urgent: boolean } | null {
  if (!expiresOn) return null
  const today = new Date().toISOString().slice(0, 10)
  const days = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days < 0) return { text: 'Past date', urgent: true }
  if (days === 0) return { text: 'Use today', urgent: true }
  if (days === 1) return { text: 'Use tomorrow', urgent: true }
  return { text: `Use by ${expiresOn}`, urgent: false }
}

function isoDateAfter(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function FoodPage() {
  const [items, setItems] = useState<FoodInventoryItem[] | null>(null)
  const [restockSuggestions, setRestockSuggestions] = useState<FoodInventoryItem[]>([])
  const [stapleSuggestions, setStapleSuggestions] = useState<Array<{ name: string; barcode?: string }>>([])
  const [canManageStaples, setCanManageStaples] = useState(false)
  const [location, setLocation] = useState<LocationTab>('fridge')
  // Only used while location === 'all', where a new item has no implicit
  // location to fall back to.
  const [addLocation, setAddLocation] = useState<FoodLocation | ''>('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [name, setName] = useState('')
  const [quickNames, setQuickNames] = useState('')
  const [quantityCount, setQuantityCount] = useState(1)
  const [netQuantityText, setNetQuantityText] = useState<string | null>(null)
  // True when netQuantityText is an unambiguous multipack ("4 x 100 g") — the
  // stepper count already captures that case. False/null means it's a plain
  // weight ("400 g") with no count semantics, which the stepper can't express.
  const [hasPackCount, setHasPackCount] = useState(false)
  const [expiresOn, setExpiresOn] = useState('')
  const [barcode, setBarcode] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [per100g, setPer100g] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null)
  const [saveAsStaple, setSaveAsStaple] = useState(false)
  const [usualGrams, setUsualGrams] = useState('')
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanningExpiry, setScanningExpiry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<FoodInventoryItem | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const router = useRouter()
  const canScan = useSyncExternalStore(() => () => {}, isBarcodeDetectorAvailable, () => false)

  const load = useCallback(async () => {
    const response = await fetch('/api/food/inventory', { cache: 'no-store' })
    const data = await response.json() as { items: FoodInventoryItem[]; restockSuggestions: FoodInventoryItem[]; stapleSuggestions: Array<{ name: string; barcode?: string }>; canManageStaples: boolean }
    setItems(data.items)
    setRestockSuggestions(data.restockSuggestions)
    setStapleSuggestions(data.stapleSuggestions)
    setCanManageStaples(data.canManageStaples)
  }, [])

  useEffect(() => { void load() }, [load])

  // On the All tab there's no implicit location — a target must be chosen
  // before anything can be added.
  const targetLocation: FoodLocation | '' = location === 'all' ? addLocation : location

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!targetLocation) return
    const names = quickNames.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)
    if (names.length === 0) return
    setSaving(true)
    try {
      const response = await fetch('/api/food/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names, location: targetLocation }),
      })
      if (!response.ok) throw new Error('Could not add food')
      setQuickNames('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function restock(item: Pick<FoodInventoryItem, 'name'> & Partial<FoodInventoryItem>) {
    const restockLocation = item.location ?? targetLocation
    if (!restockLocation) return
    setSaving(true)
    try {
      const response = await fetch('/api/food/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          name: item.name, barcode: item.barcode, brand: item.brand, imageUrl: item.imageUrl,
          location: restockLocation, quantity: item.quantity ?? '1 item', expiresOn: null,
        }),
      })
      if (!response.ok) throw new Error('Could not restock food')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || !targetLocation) return
    setSaving(true)
    try {
      const response = await fetch('/api/food/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A plain weight from the scan ("400 g") has no count semantics the
        // stepper can express, so it's saved verbatim rather than collapsed
        // to "1 item" and lost — combined with the stepper count only if the
        // athlete actually bumped it up (e.g. "2 x 400 g"). A detected
        // multipack ("4 x 100 g") already has its count on the stepper, so
        // that one stays as a plain count.
        body: JSON.stringify({
          name: name.trim(),
          quantity: netQuantityText && !hasPackCount
            ? (quantityCount > 1 ? `${quantityCount} x ${netQuantityText}` : netQuantityText)
            : formatCount(quantityCount),
          location: targetLocation, barcode: barcode || undefined, brand: brand || undefined, imageUrl: imageUrl || undefined, expiresOn: expiresOn || null,
        }),
      })
      if (!response.ok) throw new Error('Could not add food')
      if (saveAsStaple && per100g) {
        const stapleResponse = await fetch('/api/food/staples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), barcode, per100g, usualGrams: Number(usualGrams) || 100 }),
        })
        if (!stapleResponse.ok) throw new Error('Could not save staple')
      }
      setName('')
      setQuantityCount(1)
      setNetQuantityText(null)
      setHasPackCount(false)
      setExpiresOn('')
      setBarcode('')
      setImageUrl(null)
      setBrand(null)
      setPer100g(null)
      setSaveAsStaple(false)
      setUsualGrams('')
      setScanNote(null)
      await load()
    } catch {
      setScanNote('Could not save this item. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleScan(code: string) {
    setScanning(false)
    setBarcode(code)
    setScanNote('Looking up barcode...')
    try {
      const response = await fetch(`/api/food/lookup?barcode=${encodeURIComponent(code)}`)
      const data = await response.json() as { found: boolean; name?: string; brands?: string; imageUrl?: string; per100g?: { calories: number; protein: number; carbs: number; fat: number }; netQuantityText?: string; packCount?: number | null }
      if (data.found && data.name) {
        setName(data.name)
        setImageUrl(data.imageUrl ?? null)
        setBrand(data.brands ?? null)
        setPer100g(data.per100g ?? null)
        setNetQuantityText(data.netQuantityText ?? null)
        setHasPackCount(Boolean(data.packCount))
        // Prefill from the pack count when OFF's text is unambiguous (e.g. "4 x
        // 100 g") — still just a starting value on the stepper, not a silent save.
        if (data.packCount) setQuantityCount(data.packCount)
        const quantityNote = data.packCount
          ? ` Quantity pre-filled to ${data.packCount} from the pack (${data.netQuantityText}) — check it.`
          : data.netQuantityText
          ? ` Will be saved as "${data.netQuantityText}". Add the expiry date.`
          : ' Add the quantity and expiry date.'
        setScanNote(`Found ${data.name}${data.brands ? ` (${data.brands})` : ''}.${quantityNote}`)
      } else {
        setScanNote(`Barcode ${code} was not found. Add the product name manually.`)
      }
    } catch {
      setScanNote('Product lookup failed. Add the product name manually.')
    }
  }

  async function removeItem(id: string, status: 'used' | 'discarded') {
    await fetch('/api/food/inventory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    await load()
  }

  async function adjustItemQuantity(item: FoodInventoryItem, delta: number) {
    const current = parseCount(item.quantity)
    if (current === null) return
    const next = Math.max(1, current + delta)
    if (next === current) return
    // Optimistic update — the stepper needs to feel instant.
    setItems((prev) => prev?.map((i) => (i._id === item._id ? { ...i, quantity: formatCount(next) } : i)) ?? prev)
    await fetch('/api/food/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item._id, quantity: formatCount(next) }),
    })
  }

  async function saveEdit() {
    if (!editDraft) return
    setSaving(true)
    try {
      const response = await fetch('/api/food/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editDraft._id,
          name: editDraft.name,
          quantity: editDraft.quantity,
          location: editDraft.location,
          expiresOn: editDraft.expiresOn,
          opened: editDraft.opened,
        }),
      })
      if (!response.ok) throw new Error('Could not update food')
      setEditingId(null)
      setEditDraft(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  const locationFiltered = items?.filter((item) => location === 'all' || item.location === location) ?? []
  const searched = search.trim()
    ? locationFiltered.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    : locationFiltered
  const visibleItems = [...searched].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'added') return b.createdAt.localeCompare(a.createdAt)
    // expiry: soonest first, items with no date sort last
    if (!a.expiresOn && !b.expiresOn) return 0
    if (!a.expiresOn) return 1
    if (!b.expiresOn) return -1
    return a.expiresOn.localeCompare(b.expiresOn)
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6 sm:px-8">
      <div className="max-w-lg mx-auto space-y-6 pb-6">
        <header className="space-y-2">
          <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">PanTrainer</p>
          <h1 className="text-3xl font-black tracking-tight uppercase">Food at home</h1>
          <p className="text-zinc-500 text-sm">Scan groceries or add what needs using up.</p>
          {canManageStaples && <Link href="/pantry" className="inline-block text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400">My nutrition staples</Link>}
        </header>

        <div className="grid grid-cols-4 gap-2">
          {LOCATIONS.map((option) => (
            <button key={option.value} onClick={() => setLocation(option.value)} className={`rounded-lg px-2 py-2 text-[10px] font-mono font-bold tracking-widest uppercase transition-colors ${location === option.value ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-200'}`}>
              {option.label}
            </button>
          ))}
          <button onClick={() => setLocation('all')} className={`rounded-lg px-2 py-2 text-[10px] font-mono font-bold tracking-widest uppercase transition-colors ${location === 'all' ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-200'}`}>
            All
          </button>
        </div>

        {location === 'all' && (
          <select value={addLocation} onChange={(event) => setAddLocation(event.target.value as FoodLocation | '')} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-300 focus:border-lime-400 focus:outline-none">
            <option value="">Where does a new item go?</option>
            {LOCATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}

        <form onSubmit={(event) => void quickAdd(event)} className="rounded-xl border border-lime-400/20 bg-lime-400/5 p-4 space-y-3">
          <div><p className="text-zinc-100 text-xs font-mono font-bold tracking-widest uppercase">Quick add{targetLocation ? ` to ${LOCATION_LABEL[targetLocation]}` : ''}</p><p className="mt-1 text-zinc-500 text-xs">Separate foods with commas or new lines. Details are optional.</p></div>
          <textarea value={quickNames} onChange={(event) => setQuickNames(event.target.value)} rows={2} placeholder="Chicken, broccoli, feta" className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-700 focus:border-lime-400 focus:outline-none" />
          <button disabled={saving || !quickNames.trim() || !targetLocation} className="w-full rounded-lg bg-lime-400 py-2.5 text-xs font-mono font-bold tracking-widest uppercase text-zinc-950 disabled:opacity-50">Add foods</button>
        </form>

        {(restockSuggestions.length > 0 || stapleSuggestions.length > 0) && <section className="space-y-2"><p className="text-zinc-500 text-[10px] font-mono font-bold tracking-widest uppercase">Add again</p><div className="flex gap-2 overflow-x-auto pb-1">{restockSuggestions.map((item) => <button key={`recent-${item._id}`} onClick={() => void restock(item)} disabled={saving} className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />}{item.name}</button>)}{stapleSuggestions.filter((staple) => !restockSuggestions.some((recent) => recent.name.toLowerCase() === staple.name.toLowerCase())).map((staple) => <button key={`staple-${staple.name}`} onClick={() => void restock({ ...staple, location: targetLocation || undefined })} disabled={saving || !targetLocation} className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">{staple.name}</button>)}</div></section>}

        {/* Without barcode detection there's little left this form adds over
            Quick Add (no auto-filled name/image), so it's hidden entirely —
            only Quick Add is shown. */}
        {canScan && (
        <form onSubmit={(event) => void addItem(event)} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-zinc-300 text-xs font-mono font-bold tracking-widest uppercase">Add with details</p>
            <button type="button" onClick={() => { setScanNote(null); setScanning(true) }} className="text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400">Scan barcode</button>
          </div>
          {scanNote && <p className="text-zinc-400 text-xs leading-relaxed">{scanNote}</p>}
          {imageUrl && <div className="flex items-center gap-3 rounded-lg bg-zinc-950 p-2"><img src={imageUrl} alt="" className="h-12 w-12 rounded-md object-cover" /><p className="text-xs text-zinc-400">Product image from barcode lookup{netQuantityText ? ` · ${netQuantityText}` : ''}</p></div>}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Food name" className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-700 focus:border-lime-400 focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5">
              <button type="button" onClick={() => setQuantityCount((n) => Math.max(1, n - 1))} className="h-7 w-7 rounded bg-zinc-800 text-sm font-bold text-zinc-300 hover:bg-zinc-700">-</button>
              <span className="flex-1 text-center text-sm font-mono">{quantityCount}</span>
              <button type="button" onClick={() => setQuantityCount((n) => n + 1)} className="h-7 w-7 rounded bg-zinc-800 text-sm font-bold text-zinc-300 hover:bg-zinc-700">+</button>
            </div>
            <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-400 focus:border-lime-400 focus:outline-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setScanningExpiry(true)} className="rounded border border-lime-400/30 px-2 py-1 text-[10px] font-mono font-bold uppercase text-lime-400">Scan expiry label</button>
            {([['Today', 0], ['Tomorrow', 1], ['+3 days', 3], ['+1 week', 7]] as const).map(([label, days]) => <button key={label} type="button" onClick={() => setExpiresOn(isoDateAfter(days))} className="rounded border border-zinc-700 px-2 py-1 text-[10px] font-mono font-bold uppercase text-zinc-400 hover:border-lime-400 hover:text-lime-400">{label}</button>)}
            {expiresOn && <button type="button" onClick={() => setExpiresOn('')} className="px-1 text-[10px] font-mono font-bold uppercase text-zinc-600">No date</button>}
          </div>
          {canManageStaples && per100g && <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2"><label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={saveAsStaple} onChange={(event) => setSaveAsStaple(event.target.checked)} /> Save as my staple</label>{saveAsStaple && <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Usual portion (g)<input type="number" min="1" value={usualGrams} onChange={(event) => setUsualGrams(event.target.value)} placeholder="100" className="mt-1 block w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none" /></label>}<p className="text-[10px] text-zinc-600">Private to your nutrition estimates, not visible to food-only access.</p></div>}
          <button disabled={saving || !name.trim() || !targetLocation} className="w-full rounded-lg bg-lime-400 py-2.5 text-xs font-mono font-bold tracking-widest uppercase text-zinc-950 disabled:opacity-50">{saving ? 'Adding...' : 'Add food'}</button>
        </form>
        )}

        <section className="space-y-2">
          <div className="flex gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-700 focus:border-lime-400 focus:outline-none" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300 focus:border-lime-400 focus:outline-none">
              {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <p className="text-zinc-500 text-[10px] font-mono font-bold tracking-widest uppercase">{visibleItems.length} available</p>
          {items === null ? <p className="py-8 text-center text-zinc-600 text-sm">Loading...</p> : visibleItems.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 py-8 text-center text-zinc-600 text-sm">{search.trim() ? 'No matches.' : `Nothing recorded${location === 'all' ? '' : ` in the ${location}`}.`}</p> : visibleItems.map((item) => {
            const expiry = expiryLabel(item.expiresOn)
            const editing = editingId === item._id && editDraft
            const count = parseCount(item.quantity)
            return <div key={item._id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              {editing ? <><input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm" /><div className="grid grid-cols-2 gap-2"><input value={editDraft.quantity} onChange={(event) => setEditDraft({ ...editDraft, quantity: event.target.value })} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm" /><input type="date" value={editDraft.expiresOn ?? ''} onChange={(event) => setEditDraft({ ...editDraft, expiresOn: event.target.value || null })} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm" /></div><div className="flex items-center gap-3"><select value={editDraft.location} onChange={(event) => setEditDraft({ ...editDraft, location: event.target.value as FoodLocation })} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs">{LOCATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><label className="text-xs text-zinc-400"><input type="checkbox" checked={editDraft.opened} onChange={(event) => setEditDraft({ ...editDraft, opened: event.target.checked })} /> Opened</label></div><div className="flex gap-2"><button onClick={() => void saveEdit()} disabled={saving || !editDraft.name.trim()} className="rounded border border-lime-400/30 px-3 py-1.5 text-[10px] font-mono font-bold uppercase text-lime-400">Save</button><button onClick={() => { setEditingId(null); setEditDraft(null) }} className="text-[10px] font-mono font-bold uppercase text-zinc-500">Cancel</button></div></> : <><div className="flex justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md bg-zinc-800 object-cover" /> : <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-800" />}<div className="min-w-0"><p className="truncate font-bold text-sm">{item.name}{location === 'all' && <span className="ml-2 text-zinc-600 text-[10px] font-mono uppercase tracking-widest">{LOCATION_LABEL[item.location]}</span>}</p><div className="flex items-center gap-2">{count !== null ? <div className="flex items-center gap-1.5"><button onClick={() => void adjustItemQuantity(item, -1)} className="h-5 w-5 rounded bg-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-700">-</button><span className="text-zinc-500 text-xs font-mono">{item.quantity}</span><button onClick={() => void adjustItemQuantity(item, 1)} className="h-5 w-5 rounded bg-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-700">+</button></div> : <p className="text-zinc-500 text-xs">{item.quantity}</p>}{item.opened && <span className="text-zinc-500 text-xs">- opened</span>}</div></div></div>{expiry && <span className={`shrink-0 text-[10px] font-mono font-bold uppercase ${expiry.urgent ? 'text-amber-400' : 'text-zinc-500'}`}>{expiry.text}</span>}</div><div className="flex gap-2"><button onClick={() => { setEditingId(item._id); setEditDraft(item) }} className="rounded border border-zinc-700 px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-300">Edit</button><button onClick={() => void removeItem(item._id, 'used')} className="rounded border border-lime-400/30 px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-lime-400">Used</button><button onClick={() => void removeItem(item._id, 'discarded')} className="rounded border border-zinc-700 px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Discard</button></div></>}
            </div>
          })}
        </section>

        <button onClick={() => void logout()} disabled={loggingOut} className="w-full rounded-lg border border-zinc-800 py-3 text-xs font-mono font-bold tracking-widest uppercase text-zinc-500">{loggingOut ? 'Signing out...' : 'Sign out'}</button>
      </div>
      {scanning && <BarcodeScanner onDetected={(code) => void handleScan(code)} onClose={() => setScanning(false)} />}
      {scanningExpiry && <ExpiryScanner onDetected={(date) => { setExpiresOn(date); setScanningExpiry(false); setScanNote(`Expiry date suggested: ${date}. Check it before adding.`) }} onClose={() => setScanningExpiry(false)} />}
    </main>
  )
}
