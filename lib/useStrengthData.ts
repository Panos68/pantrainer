'use client'

import { useEffect, useState } from 'react'
import type { StrengthSummary } from './strength-summary'
import { DEFAULT_PLATE_INVENTORY, type PlateInventory } from './plates'

// Records + suggestions for PR badges and "next target" hints, and the owned
// plates for plate math. Both are best-effort: the pages work without them.
export function useStrengthData(): { summary: StrengthSummary | null; plates: PlateInventory } {
  const [summary, setSummary] = useState<StrengthSummary | null>(null)
  const [plates, setPlates] = useState<PlateInventory>(DEFAULT_PLATE_INVENTORY)

  useEffect(() => {
    let cancelled = false
    fetch('/api/strength', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: StrengthSummary | null) => { if (!cancelled && s) setSummary(s) })
      .catch(() => {})
    fetch('/api/equipment', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: PlateInventory | null) => { if (!cancelled && p) setPlates(p) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return { summary, plates }
}
