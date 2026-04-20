import DayCard from './DayCard'
import type { Session } from '@/lib/schema'

interface WeekGridProps {
  sessions: Session[]
  todayISO: string
  notionConfigured?: boolean
}

export default function WeekGrid({ sessions, todayISO, notionConfigured }: WeekGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
      {sessions.map((session) => (
        <DayCard
          key={session.date}
          session={session}
          isToday={session.date === todayISO}
          notionConfigured={notionConfigured}
        />
      ))}
    </div>
  )
}
