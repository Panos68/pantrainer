import { cn } from '@/lib/utils'

type GymWeek = 'week_a' | 'week_b' | 'legs_week'

const GYM_WEEK_LABELS: Record<GymWeek, string> = {
  week_a: 'WEEK A — PULL',
  week_b: 'WEEK B — PUSH',
  legs_week: 'LEGS WEEK',
}

interface GymWeekBadgeProps {
  gymWeek: GymWeek
  className?: string
}

export default function GymWeekBadge({ gymWeek, className }: GymWeekBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full',
        'bg-lime-400/10 border border-lime-400/30',
        'text-lime-400 text-xs font-mono font-bold tracking-widest uppercase',
        className
      )}
    >
      {GYM_WEEK_LABELS[gymWeek]}
    </span>
  )
}
