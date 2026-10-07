'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'

async function errorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 429) {
    const body = await res.json().catch(() => ({})) as { retryAfterSec?: number }
    const minutes = Math.max(1, Math.ceil((body.retryAfterSec ?? 900) / 60))
    return `Too many attempts — try again in ${minutes} min`
  }
  return fallback
}

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const passkeySupported = useSyncExternalStore(() => () => {}, browserSupportsWebAuthn, () => false)
  const [demoEnabled, setDemoEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/demo')
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => { if (!cancelled) setDemoEnabled(d.enabled) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleDemo() {
    setLoading(true)
    const res = await fetch('/api/auth/demo', { method: 'POST' })
    if (res.ok) goAfterLogin('/')
    else { setError('Demo is unavailable'); setLoading(false) }
  }

  function goAfterLogin(redirectTo: string) {
    const destination = redirectTo === '/food' ? '/food' : (returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/')
    router.push(destination)
    router.refresh()
  }

  async function handlePasskey() {
    setLoading(true)
    setError('')
    try {
      const optionsRes = await fetch('/api/auth/passkey/login-options', { method: 'POST' })
      const data = await optionsRes.json() as { available: boolean; options?: Parameters<typeof startAuthentication>[0]['optionsJSON'] }
      if (!data.available || !data.options) {
        setError('No passkey set up yet — sign in with your password, then add one in Settings')
        return
      }
      const response = await startAuthentication({ optionsJSON: data.options })
      const verifyRes = await fetch('/api/auth/passkey/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!verifyRes.ok) {
        setError(await errorMessage(verifyRes, 'Passkey not accepted'))
        return
      }
      const body = await verifyRes.json() as { redirectTo: string }
      goAfterLogin(body.redirectTo)
    } catch (err) {
      // NotAllowedError = the user dismissed the Face ID / fingerprint prompt.
      if (!(err instanceof Error && err.name === 'NotAllowedError')) setError('Passkey sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      const body = await res.json() as { redirectTo: string }
      goAfterLogin(body.redirectTo)
    } else {
      setError(await errorMessage(res, 'Wrong password'))
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase mb-2">
            PanTrainer
          </p>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            Sign In
          </h1>
        </div>

        {demoEnabled && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleDemo}
              disabled={loading}
              className="w-full h-12 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
            >
              Explore the demo
            </button>
            <p className="text-center text-[11px] text-zinc-500">Sample data · resets regularly · no account needed</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-xl px-4 text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-lime-400"
          />
          {error && (
            <p className="text-red-400 text-xs font-mono text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-12 bg-lime-400 hover:bg-lime-300 active:bg-lime-500 text-zinc-950 font-black text-sm tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'CHECKING...' : 'ENTER'}
          </button>
        </form>

        {passkeySupported && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-zinc-600 text-[10px] font-mono tracking-widest uppercase">
              <div className="flex-1 h-px bg-zinc-800" />or<div className="flex-1 h-px bg-zinc-800" />
            </div>
            <button
              type="button"
              onClick={handlePasskey}
              disabled={loading}
              className="w-full h-12 border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-bold text-xs tracking-[0.15em] uppercase rounded-xl transition-colors disabled:opacity-50"
            >
              Face ID / fingerprint
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
