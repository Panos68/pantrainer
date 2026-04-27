import Link from 'next/link'
import type { WeekDoc } from '@/lib/schema'

interface HomeQuickPanelsProps {
  week: WeekDoc
  todayISO: string
  baselineRhr: number
}

export default function HomeQuickPanels({ week, todayISO }: HomeQuickPanelsProps) {
  const sessions = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date))
  const todaySession = sessions.find((s) => s.date === todayISO) ?? null

  const actionHref = todaySession ? `/log/${todaySession.day.toLowerCase()}` : '/'
  const actionLabel = !todaySession
    ? 'Open Week'
    : todaySession.status === 'completed' || todaySession.status === 'skipped'
    ? 'Review Today'
    : todaySession.status === 'in_progress'
    ? 'Continue Session'
    : 'Start Session'

  const sessionType = todaySession?.type ?? null
  const sessionSubtype = todaySession?.subtype ?? null

  return (
    <section>
      <div className="rounded-xl border border-lime-400/30 bg-gradient-to-r from-zinc-900 via-zinc-900 to-lime-400/10 p-4 space-y-3 shadow-[0_0_32px_rgba(163,230,53,0.10)]">
        <p className="text-lime-400/70 text-[10px] font-mono tracking-[0.25em] uppercase">Today</p>

        <div>
          {sessionType ? (
            <p className="text-zinc-100 text-3xl font-black uppercase tracking-tight leading-none">
              {sessionType}
            </p>
          ) : (
            <p className="text-zinc-500 text-lg font-black uppercase tracking-tight">No session today</p>
          )}
          {sessionSubtype && (
            <p className="text-zinc-400 text-xs font-mono mt-1.5 line-clamp-2">{sessionSubtype}</p>
          )}
        </div>

        {todaySession && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="inline-flex h-6 items-center rounded-md border border-lime-400/30 bg-lime-400/10 px-2 text-[10px] tracking-widest uppercase text-lime-300">
              {todaySession.status?.replace('_', ' ') ?? 'planned'}
            </span>
          </div>
        )}

        <Link
          href={actionHref}
          className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-lime-400 hover:bg-lime-300 text-zinc-950 px-6 text-sm font-black tracking-[0.12em] uppercase transition-colors"
        >
          {actionLabel}
          <span className="transition-transform duration-150 group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </section>
  )
}
