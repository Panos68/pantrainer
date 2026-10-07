'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type TemplateInfo = {
  id: string
  name: string
  summary: string
  daysPerWeek: number
  goal: string
  days: Array<{ day: string; type: string; subtype: string }>
}

type Pending = { source: string; created_at: string } | null

// "template:upper-lower-4" → "the Upper / lower template"; "cowork" stays as is.
function sourceLabel(source: string, templates: TemplateInfo[] | null): string {
  if (!source.startsWith('template:')) return source
  const t = templates?.find((x) => x.id === source.slice('template:'.length))
  return t ? `the ${t.name} template` : 'a template'
}

const TYPE_COLOR: Record<string, string> = {
  Strength: 'text-lime-400 border-lime-400/30',
  Conditioning: 'text-sky-400 border-sky-400/30',
  Recovery: 'text-zinc-400 border-zinc-600',
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateInfo[] | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [week, setWeek] = useState<'next' | 'current'>('next')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/templates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { templates: TemplateInfo[]; pendingProposal: Pending }) => {
        if (cancelled) return
        setTemplates(d.templates)
        setPending(d.pendingProposal)
      })
      .catch(() => { if (!cancelled) setError('Could not load templates') })
    return () => { cancelled = true }
  }, [])

  async function proposeTemplate(id: string, replace: boolean) {
    if (pending && !replace) {
      setConfirmReplace(id)
      return
    }
    setBusy(id)
    setError(null)
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: id, week, replace }),
    })
    setBusy(null)
    if (res.ok) {
      router.push('/export')
      return
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; pendingProposal?: Pending }
    if (res.status === 409 && body.pendingProposal) {
      setPending(body.pendingProposal)
      setConfirmReplace(id)
    } else {
      setError(body.error ?? 'Could not create the plan')
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-3">
          <Link href="/export" className="text-zinc-600 hover:text-zinc-400 text-xs font-mono tracking-widest uppercase">← Plan</Link>
          <h1 className="text-3xl font-black uppercase tracking-tight">Start from a template</h1>
          <p className="text-sm text-zinc-400">
            Pick a ready-made week. It becomes a <strong className="text-zinc-200">proposal</strong>{' '}on the Plan page — nothing changes
            until you review and apply it, and sessions you&apos;ve already started are never replaced. Weights are filled from your
            own history using the progression targets; new lifts are left blank.
          </p>
          <div className="inline-flex rounded-lg border border-zinc-800 p-0.5 text-xs font-mono">
            {(['next', 'current'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeek(w)}
                className={`px-3 py-1.5 rounded-md uppercase tracking-widest ${week === w ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`}
              >
                {w === 'next' ? 'Next week' : 'This week'}
              </button>
            ))}
          </div>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {templates === null && !error && <p className="text-sm text-zinc-500">Loading…</p>}

        <ul className="space-y-4">
          {templates?.map((t) => (
            <li key={t.id} className="rounded-xl bg-zinc-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{t.name}</h2>
                  <p className="text-sm text-zinc-400 mt-1">{t.summary}</p>
                </div>
                <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t.daysPerWeek} days</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.days.map((d) => (
                  <span key={d.day} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${TYPE_COLOR[d.type] ?? 'text-zinc-400 border-zinc-700'}`}>
                    {d.day.slice(0, 3)} · {d.subtype}
                  </span>
                ))}
              </div>
              {confirmReplace === t.id && pending ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs text-amber-200">
                    A proposal from <strong>{sourceLabel(pending.source, templates)}</strong> ({new Date(pending.created_at).toLocaleString()}) is waiting for
                    review. Replace it with this template?
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void proposeTemplate(t.id, true)} disabled={busy != null}
                      className="h-8 px-3 rounded-lg bg-amber-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest">
                      Replace it
                    </button>
                    <button type="button" onClick={() => setConfirmReplace(null)}
                      className="h-8 px-3 rounded-lg border border-zinc-700 text-xs font-mono uppercase tracking-widest">
                      Keep the existing one
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void proposeTemplate(t.id, false)}
                  disabled={busy != null}
                  className="h-9 px-4 rounded-lg bg-lime-400 text-zinc-950 text-xs font-mono font-bold uppercase tracking-widest disabled:opacity-40"
                >
                  {busy === t.id ? 'Creating…' : `Propose for ${week === 'next' ? 'next week' : 'this week'}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
