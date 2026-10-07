'use client'

import { useCallback, useEffect, useState } from 'react'
import SectionLabel, { formatDate } from './SectionLabel'

type Listing = {
  personal: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }>
  grants: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; active: boolean }>
  legacyTokenActive: boolean
}

export default function ApiTokensSection() {
  const [data, setData] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/tokens', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) setError('Could not load tokens')
        else setData(await res.json())
      })
      .catch(() => { if (!cancelled) setError('Could not load tokens') })
    return () => { cancelled = true }
  }, [reloadKey])

  async function createToken(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const res = await fetch('/api/settings/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setBusy(false)
    if (!res.ok) { setError('Could not create token'); return }
    const body = await res.json() as { token: string }
    setCreated(body.token)
    setCopied(false)
    setName('')
    load()
  }

  async function revoke(id: string, label: string) {
    if (!window.confirm(`Revoke "${label}"? Anything using it will stop working immediately.`)) return
    const res = await fetch(`/api/settings/tokens/${id}`, { method: 'DELETE' })
    if (!res.ok) setError('Could not revoke')
    load()
  }

  return (
    <>
      <section className="space-y-3">
        <SectionLabel>API tokens</SectionLabel>
        <p className="text-sm text-zinc-500">
          For Claude Code, scheduled jobs and shortcuts. Send as <code className="text-zinc-300">Authorization: Bearer &lt;token&gt;</code>.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <form onSubmit={createToken} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. iOS food shortcut"
            maxLength={60}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
          <button disabled={busy || !name.trim()} className="px-4 rounded-lg bg-lime-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-40">
            Create
          </button>
        </form>

        {created && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <p className="text-xs text-amber-300">Copy this now — it won&apos;t be shown again.</p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 break-all text-xs bg-zinc-950 rounded-lg px-2.5 py-2 text-zinc-200">{created}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(created).then(() => setCopied(true)) }}
                className="px-3 rounded-lg border border-zinc-700 text-xs font-mono"
              >{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-zinc-800 rounded-xl bg-zinc-900">
          {data?.personal.length === 0 && <li className="px-4 py-3 text-sm text-zinc-600">No tokens yet</li>}
          {data?.personal.map((t) => (
            <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm truncate ${t.revokedAt ? 'text-zinc-600 line-through' : ''}`}>{t.name}</p>
                <p className="text-[11px] text-zinc-500 font-mono">created {formatDate(t.createdAt)} · last used {formatDate(t.lastUsedAt)}</p>
              </div>
              {t.revokedAt
                ? <span className="text-[10px] font-mono uppercase text-zinc-600">revoked</span>
                : <button onClick={() => revoke(t.id, t.name)} className="text-[11px] font-mono text-red-400 hover:text-red-300">Revoke</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionLabel>Connected apps</SectionLabel>
        <p className="text-sm text-zinc-500">Apps you approved through “Connect to PanTrainer”, e.g. Claude connectors.</p>
        <ul className="divide-y divide-zinc-800 rounded-xl bg-zinc-900">
          {data?.grants.length === 0 && <li className="px-4 py-3 text-sm text-zinc-600">None yet</li>}
          {data?.grants.map((g) => (
            <li key={g.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm truncate ${g.active ? '' : 'text-zinc-600 line-through'}`}>{g.name}</p>
                <p className="text-[11px] text-zinc-500 font-mono">since {formatDate(g.createdAt)} · last used {formatDate(g.lastUsedAt)}</p>
              </div>
              {g.active
                ? <button onClick={() => revoke(g.id, g.name)} className="text-[11px] font-mono text-red-400 hover:text-red-300">Revoke</button>
                : <span className="text-[10px] font-mono uppercase text-zinc-600">revoked</span>}
            </li>
          ))}
        </ul>
      </section>

      {data?.legacyTokenActive && (
        <section className="rounded-xl border border-zinc-800 p-4 space-y-1">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">Legacy token active</p>
          <p className="text-sm text-zinc-500">
            <code className="text-zinc-300">AUTOMATION_API_TOKEN</code> is still accepted everywhere. Once your connectors and jobs use
            tokens from this page, delete that environment variable to retire it.
          </p>
        </section>
      )}
    </>
  )
}
