import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/schema'

interface DayCardProps {
  session: Session
  isToday: boolean
}

const STATUS_CONFIG = {
  planned: {
    label: 'PLANNED',
    classes: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  },
  in_progress: {
    label: 'IN PROGRESS',
    classes: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  },
  completed: {
    label: 'DONE',
    classes: 'bg-lime-400/10 text-lime-400 border-lime-400/30',
  },
  skipped: {
    label: 'SKIPPED',
    classes: 'bg-zinc-800/50 text-zinc-600 border-zinc-700/50',
  },
} as const

const TYPE_COLORS: Record<string, string> = {
  Strength: 'text-violet-400',
  Conditioning: 'text-sky-400',
  Recovery: 'text-emerald-400',
  Rest: 'text-zinc-500',
}

export default function DayCard({ session, isToday }: DayCardProps) {
  const slug = session.day.toLowerCase()
  const status = session.status ?? 'planned'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planned
  const typeColor = TYPE_COLORS[session.type] ?? 'text-zinc-400'
  const isCompleted = status === 'completed'
  const isSkipped = status === 'skipped'

  const shortDay = session.day.slice(0, 3).toUpperCase()
  const dateObj = new Date(session.date + 'T12:00:00')
  const dateLabel = dateObj.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })

  return (
    <Link
      href={`/log/${slug}`}
      className={cn(
        'block rounded-xl border transition-all duration-150',
        'bg-zinc-900 hover:bg-zinc-800/80',
        isToday
          ? 'border-lime-400/30 shadow-[0_0_20px_rgba(163,230,53,0.07)]'
          : 'border-zinc-800',
        isSkipped && 'opacity-60',
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-xs font-mono font-bold tracking-widest',
                  isToday ? 'text-lime-400' : 'text-zinc-400',
                )}
              >
                {shortDay}
              </span>
              <span className="text-zinc-600 text-xs font-mono">{dateLabel}</span>
            </div>
            <div className={cn('text-sm font-bold tracking-wide uppercase mt-0.5', typeColor)}>
              {session.type}
            </div>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold tracking-widest uppercase shrink-0',
              statusCfg.classes,
            )}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* Metrics if completed */}
        {isCompleted && (session.duration_min || session.avg_hr_bpm || session.total_calories) ? (
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800">
            {session.duration_min != null && (
              <div>
                <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">
                  MIN
                </div>
                <div className="text-lime-400 text-xl font-mono font-black leading-none">
                  {session.duration_min}
                </div>
              </div>
            )}
            {session.avg_hr_bpm != null && (
              <div>
                <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">
                  BPM
                </div>
                <div className="text-sky-400 text-xl font-mono font-black leading-none">
                  {session.avg_hr_bpm}
                </div>
              </div>
            )}
            {session.total_calories != null && (
              <div>
                <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mb-0.5">
                  KCAL
                </div>
                <div className="text-violet-400 text-xl font-mono font-black leading-none">
                  {session.total_calories}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Subtype / plan text for non-completed */
          session.subtype && (
            <p className="text-zinc-500 text-xs font-mono leading-snug line-clamp-2 pt-1 border-t border-zinc-800/60">
              {session.subtype}
            </p>
          )
        )}

        {/* Today indicator */}
        {isToday && (
          <div className="flex items-center gap-1.5 pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
            <span className="text-lime-400/70 text-[10px] font-mono tracking-widest uppercase">
              Today
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
