'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { calcAdaptiveAlert, type AdaptiveAlert } from '@/lib/adaptive-alert'

interface RecoveryApiResponse {
  score: { total: number }
}

interface SessionApiResponse {
  type: string
  subtype: string | null
  status: string
}

export default function AdaptiveAlertBanner() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const dayName = format(new Date(), 'EEEE').toLowerCase()
  const [alert, setAlert] = useState<AdaptiveAlert | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const storageKey = `alert-dismissed-${today}`
    if (sessionStorage.getItem(storageKey)) {
      setDismissed(true)
      return
    }

    Promise.all([
      fetch(`/api/readiness?date=${today}`).then((r) => r.json() as Promise<RecoveryApiResponse>),
      fetch(`/api/session/${dayName}`).then((r) => r.json() as Promise<SessionApiResponse>),
    ])
      .then(([recovery, session]) => {
        if (!recovery.score || !session.type) return
        const result = calcAdaptiveAlert(
          recovery.score.total,
          session.type,
          session.subtype,
          session.status,
        )
        setAlert(result)
      })
      .catch(() => {})
  }, [today, dayName])

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
