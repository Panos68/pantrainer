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

  return (
    <section>
      <div className="rounded-xl border border-lime-400/30 bg-gradient-to-br from-zinc-900 via-zinc-900 to-lime-400/5 p-4 space-y-3 shadow-[0_0_24px_rgba(163,230,53,0.08)]">
        <p className="text-lime-400/80 text-[10px] font-mono tracking-[0.2em] uppercase">Today</p>
        <div>
          <p className="text-zinc-100 text-sm font-mono font-bold uppercase">
            {todaySession ? `${todaySession.day} · ${todaySession.type}` : 'No session for today'}
          </p>
          {todaySession?.subtype && (
            <p className="text-zinc-300 text-xs font-mono mt-1 line-clamp-2">{todaySession.subtype}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="inline-flex h-6 items-center rounded-md border border-lime-400/30 bg-lime-400/10 px-2 text-[10px] tracking-widest uppercase text-lime-300">
            {todaySession?.status?.replace('_', ' ') ?? 'planned'}
          </span>
        </div>
        <Link
          href={actionHref}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-lime-400 hover:bg-lime-300 text-zinc-950 px-4 text-xs font-black tracking-[0.15em] uppercase transition-colors"
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  )
}
