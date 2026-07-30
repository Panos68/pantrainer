'use client'

import { useEffect, useState } from 'react'
import type { AdaptiveAlert } from '@/lib/adaptive-alert'

export default function AdaptiveAlertBanner({ alert, today }: { alert: AdaptiveAlert | null; today: string }) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const storageKey = `alert-dismissed-${today}`
    if (sessionStorage.getItem(storageKey)) {
      setDismissed(true)
    }
  }, [today])

  function dismiss() {
    sessionStorage.setItem(`alert-dismissed-${today}`, '1')
    setDismissed(true)
  }

  if (!alert || dismissed) return null

  const isWarn = alert.level === 'warn'
  const colors = isWarn
    ? { border: 'border-red-900', bg: 'bg-red-950/40', icon: 'text-red-400', text: 'text-red-300' }
    : { border: 'border-amber-900', bg: 'bg-amber-950/30', icon: 'text-amber-400', text: 'text-amber-300' }

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-3 flex items-start gap-3`}>
      <span className={`text-lg mt-0.5 ${colors.icon}`}>{isWarn ? '⚠️' : '⚡'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${colors.text}`}>{alert.message}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{alert.suggestion}</p>
      </div>
      <button
        onClick={dismiss}
        className="text-zinc-600 hover:text-zinc-400 text-lg leading-none flex-shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
