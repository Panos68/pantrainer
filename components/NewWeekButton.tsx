'use client'

import { useState } from 'react'

interface Props {
  label?: string
  className?: string
}

export default function NewWeekButton({ label = 'Start New Week', className }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch('/api/week/new', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? 'Creating…' : label}
    </button>
  )
}
