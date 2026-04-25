'use client'

import { useState } from 'react'

export default function ExerciseDemo({ name }: { name: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/exercise-demo?name=${encodeURIComponent(name)}`)
      const { url } = await res.json()
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name}`)}`,
        '_blank',
        'noopener,noreferrer'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors text-[10px] disabled:opacity-50"
      title="How to perform"
      disabled={loading}
    >
      {loading ? '…' : '↗'}
    </button>
  )
}
