'use client'

import { useEffect, useState } from 'react'

interface Props {
  label?: string
  className?: string
}

type Readiness = {
  canCreate: boolean
  reason?: string
}

export default function NewWeekButton({ label = 'Create from Saved Template', className }: Props) {
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [readiness, setReadiness] = useState<Readiness>({ canCreate: true })

  useEffect(() => {
    let cancelled = false

    async function loadReadiness() {
      try {
        const res = await fetch('/api/week/new', { cache: 'no-store' })
        const data = (await res.json()) as Readiness
        if (!cancelled && typeof data.canCreate === 'boolean') {
          setReadiness(data)
        }
      } catch {
        if (!cancelled) {
          setReadiness({ canCreate: false, reason: 'Could not check if template is ready' })
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    void loadReadiness()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleClick() {
    if (checking || !readiness.canCreate) return
    setLoading(true)
    const res = await fetch('/api/week/new', { method: 'POST' })
    if (res.ok) {
      window.location.href = '/'
      return
    }
    const error = (await res.json().catch(() => ({ error: 'Failed to create week' }))) as { error?: string }
    setReadiness({
      canCreate: false,
      reason: error.error ?? 'Failed to create week',
    })
    setLoading(false)
  }

  const disabled = loading || checking || !readiness.canCreate
  const buttonTitle = readiness.reason ?? 'Create next week from saved template'

  return (
    <button onClick={handleClick} disabled={disabled} className={className} title={buttonTitle}>
      {loading ? 'Creating…' : checking ? 'Checking…' : label}
    </button>
  )
}
