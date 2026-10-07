'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import SectionLabel, { formatDate } from './SectionLabel'

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null }

function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'This device'
}

export default function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const supported = useSyncExternalStore(() => () => {}, browserSupportsWebAuthn, () => false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/passkeys', { cache: 'no-store' })
      .then(async (res) => {
        if (!cancelled && res.ok) setPasskeys(((await res.json()) as { passkeys: Passkey[] }).passkeys)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [reloadKey])

  async function addPasskey() {
    setBusy(true)
    setMessage(null)
    try {
      const optionsRes = await fetch('/api/auth/passkey/register-options', { method: 'POST' })
      if (!optionsRes.ok) throw new Error('Could not start registration')
      const response = await startRegistration({ optionsJSON: await optionsRes.json() })
      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, name: guessDeviceName() }),
      })
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Could not save passkey')
      }
      setMessage({ ok: true, text: 'Passkey added — you can now sign in with Face ID / fingerprint on this device.' })
      load()
    } catch (err) {
      const cancelled = err instanceof Error && err.name === 'NotAllowedError'
      if (!cancelled) setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not add passkey' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Passkey) {
    if (!window.confirm(`Remove the passkey "${p.name}"? That device will need the password again.`)) return
    await fetch(`/api/settings/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    load()
  }

  return (
    <section className="space-y-3">
      <SectionLabel>Passkeys</SectionLabel>
      <p className="text-sm text-zinc-500">
        Sign in with Face ID, Touch ID, fingerprint or your device PIN instead of the password. Add one per device.
      </p>
      {supported ? (
        <button
          type="button"
          onClick={addPasskey}
          disabled={busy}
          className="h-10 px-4 rounded-lg bg-lime-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-40"
        >
          {busy ? 'Waiting for device…' : 'Add passkey on this device'}
        </button>
      ) : (
        <p className="text-xs text-zinc-600">This browser doesn&apos;t support passkeys.</p>
      )}
      {message && <p className={`text-xs ${message.ok ? 'text-lime-400' : 'text-red-400'}`}>{message.text}</p>}
      <ul className="divide-y divide-zinc-800 rounded-xl bg-zinc-900">
        {passkeys?.length === 0 && <li className="px-4 py-3 text-sm text-zinc-600">No passkeys yet</li>}
        {passkeys?.map((p) => (
          <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm truncate">{p.name}</p>
              <p className="text-[11px] text-zinc-500 font-mono">added {formatDate(p.createdAt)} · last used {formatDate(p.lastUsedAt)}</p>
            </div>
            <button onClick={() => remove(p)} className="text-[11px] font-mono text-red-400 hover:text-red-300">Remove</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
