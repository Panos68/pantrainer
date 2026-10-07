'use client'

import { useEffect, useState } from 'react'
import type { StrengthSummary } from './strength-summary'

// Records + suggestions for PR badges and "next target" hints. Best-effort:
// the pages work without them.
export function useStrengthData(): { summary: StrengthSummary | null } {
  const [summary, setSummary] = useState<StrengthSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/strength', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: StrengthSummary | null) => { if (!cancelled && s) setSummary(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return { summary }
}
