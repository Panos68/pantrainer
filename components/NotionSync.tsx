'use client'

import { useState } from 'react'
import { toast } from 'sonner'

interface NotionSyncProps {
  lastSync: string | null
  notionConfigured: boolean
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return 'Never synced'
  }
}

export default function NotionSync({ lastSync, notionConfigured }: NotionSyncProps) {
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)

  if (!notionConfigured) {
    return (
      <span className="text-xs font-mono text-zinc-600 tracking-wide">
        Notion sync not configured — add NOTION_TOKEN to .env.local
      </span>
    )
  }

  async function handlePush() {
    setPushing(true)
    try {
      const res = await fetch('/api/notion/push', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Push failed')
      } else {
        toast.success(`Pushed ${data.pushed} sessions to Notion`)
      }
    } catch {
      toast.error('Push failed — network error')
    } finally {
      setPushing(false)
    }
  }

  async function handlePull() {
    setPulling(true)
    try {
      const res = await fetch('/api/notion/pull', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Pull failed')
      } else {
        toast.success(`Pulled ${data.pulled} updates from Notion`)
        window.location.reload()
      }
    } catch {
      toast.error('Pull failed — network error')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-xs font-mono text-zinc-500 tracking-wide">
        Notion: {formatLastSync(lastSync)}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={handlePush}
          disabled={pushing || pulling}
          className="px-4 h-8 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 hover:text-zinc-50 font-bold text-xs tracking-[0.12em] uppercase rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all"
        >
          {pushing ? 'Pushing…' : 'Push to Notion'}
        </button>
        <button
          onClick={handlePull}
          disabled={pushing || pulling}
          className="px-4 h-8 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 hover:text-zinc-50 font-bold text-xs tracking-[0.12em] uppercase rounded-lg border border-zinc-700 hover:border-zinc-500 transition-all"
        >
          {pulling ? 'Pulling…' : 'Pull from Notion'}
        </button>
      </div>
    </div>
  )
}
