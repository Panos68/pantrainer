import DayCard from './DayCard'
import type { Session, GarminRecoveryDay, NutritionLogEntry, CoachNote } from '@/lib/schema'

interface WeekGridProps {
  sessions: Session[]
  todayISO: string
  garminRecovery: Record<string, GarminRecoveryDay>
  nutritionByDate?: Record<string, NutritionLogEntry>
  coachNoteByDate?: Record<string, CoachNote>
  readOnly?: boolean
  collapsibleOnMobile?: boolean
}

export default function WeekGrid({
  sessions,
  todayISO,
  garminRecovery,
  nutritionByDate = {},
  coachNoteByDate = {},
  readOnly = false,
  collapsibleOnMobile = false,
}: WeekGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
      {sessions.map((session) => (
        <DayCard
          key={session.date}
          session={session}
          isToday={session.date === todayISO}
          recovery={garminRecovery[session.date] ?? null}
          nutrition={nutritionByDate[session.date] ?? null}
          coachNote={coachNoteByDate[session.date] ?? null}
          readOnly={readOnly}
          collapsibleOnMobile={collapsibleOnMobile}
        />
      ))}
    </div>
  )
}
