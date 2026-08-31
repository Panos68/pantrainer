'use client'

import { useMemo, useState } from 'react'
import type { WeekDoc, NutritionLogEntry } from '@/lib/schema'
import { isMidDaySnapshot } from '@/lib/recovery-freshness'
import WeekGrid from './WeekGrid'

interface WeekBrowserProps {
  weeks: WeekDoc[]
  pendingWeek?: WeekDoc
  todayISO: string
  nutritionByDate?: Record<string, NutritionLogEntry>
}

export default function WeekBrowser({ weeks, pendingWeek, todayISO, nutritionByDate = {} }: WeekBrowserProps) {
  const allWeeks = pendingWeek ? [...weeks, pendingWeek] : weeks

  const defaultDayForWeek = (week: WeekDoc) =>
    week.sessions.find((s) => s.date === todayISO)?.day ?? week.sessions[0]?.day ?? 'Monday'

  const [index, setIndex] = useState(Math.max(weeks.length - 1, 0))
  const [activeDay, setActiveDay] = useState<string>(defaultDayForWeek(weeks[Math.max(weeks.length - 1, 0)]))
  const selected = allWeeks[index]
  const isCurrent = index === weeks.length - 1
  const isPending = pendingWeek != null && index === allWeeks.length - 1 && !isCurrent

  const completedCount = useMemo(
    () => selected.sessions.filter((s) => s.status === 'completed').length,
    [selected.sessions],
  )

  const nutritionSummary = useMemo(() => {
    // Only count days up to today — future/planned days in the current week
    // never have an estimate and shouldn't count as "missing" one.
    const relevantDates = selected.sessions.map((s) => s.date).filter((d) => d <= todayISO)
    const entries = relevantDates
      .map((d) => nutritionByDate[d])
      .filter((e): e is NutritionLogEntry => e != null)
    if (relevantDates.length === 0) return null
    const totalCalories = entries.reduce((sum, e) => sum + e.estimatedCalories, 0)
    const totalProtein = entries.reduce((sum, e) => sum + (e.macros?.protein ?? 0), 0)
    const totalCarbs = entries.reduce((sum, e) => sum + (e.macros?.carbs ?? 0), 0)
    const totalFat = entries.reduce((sum, e) => sum + (e.macros?.fat ?? 0), 0)

    // Balance needs a day's burn to be FINAL, not a live same-day snapshot —
    // only pair up days that have both a saved estimate and a settled burn.
    const recovery = selected.garmin_recovery ?? {}
    const balanceDates = relevantDates.filter((d) => {
      const entry = nutritionByDate[d]
      const burn = recovery[d]?.total_kilocalories
      if (!entry || typeof burn !== 'number' || burn <= 0) return false
      return !isMidDaySnapshot(d, recovery[d]?.fetched_at)
    })
    const avgBurn = balanceDates.length > 0
      ? Math.round(balanceDates.reduce((sum, d) => sum + (recovery[d].total_kilocalories as number), 0) / balanceDates.length)
      : null
    const avgIntakeForBalance = balanceDates.length > 0
      ? Math.round(balanceDates.reduce((sum, d) => sum + nutritionByDate[d].estimatedCalories, 0) / balanceDates.length)
      : null
    const avgBalance = avgBurn != null && avgIntakeForBalance != null ? avgBurn - avgIntakeForBalance : null

    return {
      daysLogged: entries.length,
      daysMissing: relevantDates.length - entries.length,
      avgCalories: entries.length > 0 ? Math.round(totalCalories / entries.length) : 0,
      avgProtein: entries.length > 0 ? Math.round(totalProtein / entries.length) : 0,
      avgCarbs: entries.length > 0 ? Math.round(totalCarbs / entries.length) : 0,
      avgFat: entries.length > 0 ? Math.round(totalFat / entries.length) : 0,
      avgBurn,
      avgBalance,
      balanceDaysCount: balanceDates.length,
    }
  }, [selected.sessions, nutritionByDate, todayISO, selected.garmin_recovery])

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-400">
          {isCurrent ? 'This Week' : isPending ? 'Next Week' : 'Archived Week'}
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-zinc-600 text-xs font-mono">
          {completedCount}/{selected.sessions.length} DONE
        </span>
      </div>

      {nutritionSummary && nutritionSummary.daysLogged > 0 && (
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
          <div>
            <span className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mr-2">
              Avg Daily Intake
            </span>
            <span className="text-zinc-100 font-mono font-bold text-sm">
              {nutritionSummary.avgCalories.toLocaleString()} cal
            </span>
          </div>
          {(nutritionSummary.avgProtein > 0 || nutritionSummary.avgCarbs > 0 || nutritionSummary.avgFat > 0) && (
            <span className="text-zinc-500 text-xs font-mono">
              {[
                nutritionSummary.avgProtein > 0 ? `${nutritionSummary.avgProtein}g protein` : null,
                nutritionSummary.avgCarbs > 0 ? `${nutritionSummary.avgCarbs}g carbs` : null,
                nutritionSummary.avgFat > 0 ? `${nutritionSummary.avgFat}g fat` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {nutritionSummary.avgBurn != null && (
            <div>
              <span className="text-zinc-500 text-[10px] font-mono tracking-[0.2em] uppercase mr-2">
                Avg Burn
              </span>
              <span className="text-zinc-100 font-mono font-bold text-sm">
                {nutritionSummary.avgBurn.toLocaleString()} cal
              </span>
            </div>
          )}
          {nutritionSummary.avgBalance != null && (
            <span
              className={`font-mono font-bold text-sm ${nutritionSummary.avgBalance > 0 ? 'text-lime-400' : 'text-amber-400'}`}
            >
              Avg {nutritionSummary.avgBalance > 0 ? 'Deficit' : 'Surplus'}: {Math.abs(nutritionSummary.avgBalance).toLocaleString()} cal
              {nutritionSummary.balanceDaysCount < nutritionSummary.daysLogged && (
                <span className="text-zinc-600 font-normal"> ({nutritionSummary.balanceDaysCount}d)</span>
              )}
            </span>
          )}
          <span className="text-zinc-600 text-xs font-mono ml-auto">
            {nutritionSummary.daysLogged} day{nutritionSummary.daysLogged === 1 ? '' : 's'} logged
            {nutritionSummary.daysMissing > 0 ? `, ${nutritionSummary.daysMissing} missing` : ''}
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <button
          type="button"
          onClick={() =>
            setIndex((i) => {
              const nextIndex = Math.max(i - 1, 0)
              setActiveDay(defaultDayForWeek(allWeeks[nextIndex]))
              return nextIndex
            })
          }
          disabled={index === 0}
          className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors text-xs font-mono tracking-widest uppercase"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-zinc-400 text-[10px] font-mono tracking-[0.2em] uppercase">
            {isCurrent ? 'Current Week' : isPending ? 'Scheduled — Read-only' : 'Read-only Archive'}
          </p>
          <p className="text-zinc-200 text-xs font-mono">{selected.week}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setIndex((i) => {
              const nextIndex = Math.min(i + 1, allWeeks.length - 1)
              setActiveDay(defaultDayForWeek(allWeeks[nextIndex]))
              return nextIndex
            })
          }
          disabled={index === allWeeks.length - 1}
          className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors text-xs font-mono tracking-widest uppercase"
        >
          Next →
        </button>
      </div>

      <div className="md:hidden mb-3 -mx-1 px-1 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {selected.sessions.map((session) => {
            const active = activeDay === session.day
            return (
              <button
                key={session.date}
                type="button"
                onClick={() => setActiveDay(session.day)}
                className={`h-8 px-3 rounded-lg border text-[10px] font-mono font-bold tracking-widest uppercase transition-colors ${
                  active
                    ? 'border-lime-400/40 bg-lime-400/10 text-lime-400'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                }`}
              >
                {session.day.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="md:hidden">
        <WeekGrid
          sessions={selected.sessions.filter((s) => s.day === activeDay)}
          todayISO={isCurrent ? todayISO : ''}
          garminRecovery={selected.garmin_recovery ?? {}}
          readOnly={!isCurrent}
          collapsibleOnMobile={isCurrent}
        />
      </div>

      <div className="hidden md:block">
        <WeekGrid
          sessions={selected.sessions}
          todayISO={isCurrent ? todayISO : ''}
          garminRecovery={selected.garmin_recovery ?? {}}
          readOnly={!isCurrent}
        />
      </div>
    </section>
  )
}
