'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Session, GarminRecoveryDay } from '@/lib/schema'
import GarminRecoveryCard from './GarminRecoveryCard'

interface DayCardProps {
  session: Session
  isToday: boolean
  recovery?: GarminRecoveryDay | null
  readOnly?: boolean
  collapsibleOnMobile?: boolean
}

const STATUS_LEFT_BORDER: Record<string, string> = {
  planned: 'border-l-zinc-700',
  in_progress: 'border-l-amber-400',
  completed: 'border-l-lime-400',
  skipped: 'border-l-zinc-700',
}

const TYPE_COLORS: Record<string, string> = {
  Strength: 'text-violet-400',
  Conditioning: 'text-sky-400',
  Recovery: 'text-emerald-400',
  Rest: 'text-zinc-500',
}

export default function DayCard({
  session,
  isToday,
  recovery,
  readOnly = false,
  collapsibleOnMobile = false,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(false)
  const slug = session.day.toLowerCase()
  const status = session.status ?? 'planned'
  const typeColor = TYPE_COLORS[session.type] ?? 'text-zinc-400'
  const isCompleted = status === 'completed'
  const isSkipped = status === 'skipped'
  const isInProgress = status === 'in_progress'

  const shortDay = session.day.slice(0, 3).toUpperCase()
  const dateObj = new Date(session.date + 'T12:00:00')
  const dateLabel = dateObj.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })

  const cardClassName = cn(
    'block rounded-xl border border-zinc-800 border-l-4 transition-all duration-150',
    STATUS_LEFT_BORDER[status] ?? 'border-l-zinc-700',
    readOnly ? 'bg-zinc-900/70' : 'bg-zinc-900 hover:bg-zinc-800/80',
    isToday && 'border-t-2 border-t-lime-400/70',
    isCompleted && 'bg-lime-400/[0.02]',
    isSkipped && 'opacity-40',
  )

  const hasExtraDetails = Boolean(session.notes) || (session.exercises?.length ?? 0) > 0
  const isMobileCollapsible = !readOnly && collapsibleOnMobile
  const showDetails = (readOnly || isMobileCollapsible) ? expanded : true

  const content = (
    <div className="p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Overline: day + date */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'text-[10px] font-mono font-bold tracking-widest uppercase',
                isToday ? 'text-lime-400' : 'text-zinc-500',
              )}
            >
              {shortDay}
            </span>
            <span className="text-zinc-600 text-[10px] font-mono">{dateLabel}</span>
          </div>
          {/* Hero: session type */}
          <div className={cn('text-2xl font-black tracking-tight uppercase leading-none', typeColor)}>
            {session.type}
          </div>
        </div>

        {/* In-progress pulse indicator */}
        {isInProgress && (
          <div className="shrink-0 flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-400 text-[10px] font-mono tracking-widest uppercase">Live</span>
          </div>
        )}
      </div>

      {/* Metrics if completed */}
      {showDetails && isCompleted && (session.duration_min || session.avg_hr_bpm || session.total_calories) ? (
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
          {session.duration_min != null && (
            <div>
              <div className="text-lime-400 text-2xl font-mono font-black leading-none">
                {session.duration_min}
              </div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mt-0.5">
                MIN
              </div>
            </div>
          )}
          {session.avg_hr_bpm != null && (
            <div>
              <div className="text-sky-400 text-2xl font-mono font-black leading-none">
                {session.avg_hr_bpm}
              </div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mt-0.5">
                BPM
              </div>
            </div>
          )}
          {session.total_calories != null && (
            <div>
              <div className="text-violet-400 text-2xl font-mono font-black leading-none">
                {session.total_calories}
              </div>
              <div className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase mt-0.5">
                KCAL
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Subtype / plan text for non-completed */
        session.subtype && (
          <p className="text-zinc-500 text-xs font-mono leading-snug pt-1 border-t border-zinc-800/60">
            {session.subtype}
          </p>
        )
      )}

      {showDetails && (readOnly || isMobileCollapsible) && hasExtraDetails && (
        <div className="pt-1 border-t border-zinc-800/60 space-y-2">
          {session.notes && (
            <div>
              <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase mb-1">Notes</p>
              <p className="text-zinc-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {session.notes}
              </p>
            </div>
          )}
          {session.exercises.length > 0 && (
            <div>
              <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase mb-1">Exercises</p>
              <ul className="space-y-1">
                {session.exercises.map((ex, i) => (
                  <li key={i} className="text-zinc-400 text-xs font-mono">
                    {ex.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recovery strip */}
      {showDetails && (
        <div className="pt-1 border-t border-zinc-800/40">
          <GarminRecoveryCard
            date={session.date}
            recovery={recovery}
            compact
            interactive={!readOnly && !isMobileCollapsible}
          />
        </div>
      )}
      {(readOnly || isMobileCollapsible) && hasExtraDetails && (
        <div className="pt-1 border-t border-zinc-800/40">
          <span className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase">
            {expanded ? 'Tap to collapse' : 'Tap to expand'}
          </span>
        </div>
      )}
    </div>
  )

  if (readOnly) {
    return (
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(cardClassName, 'w-full text-left')}
      >
        {content}
      </button>
    )
  }

  if (isMobileCollapsible) {
    return (
      <div className={cn(cardClassName, 'md:hover:bg-zinc-800/80')}>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full text-left"
        >
          {content}
        </button>
        {showDetails && (
          <div className="px-4 pb-4">
            <Link
              href={`/log/${slug}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 px-3 text-[10px] font-mono font-bold tracking-[0.12em] uppercase transition-colors"
            >
              Open Session
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={`/log/${slug}`} className={cardClassName}>
      {content}
    </Link>
  )
}
