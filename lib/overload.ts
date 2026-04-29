import type { WeekDoc } from './schema'
import { progressionFromCompletedStrengthSessions } from './progression'

export type OverloadSignal = 'progress' | 'plateau' | 'pr' | 'ok'

export interface ExerciseInsight {
  exercise: string
  currentWeight: number
  signal: OverloadSignal
  weeklyVelocityPct: number | null
  weeksAtCurrentWeight: number
  suggestion: string
}

function numericLifts(week: WeekDoc): Record<string, number> {
  const derived = progressionFromCompletedStrengthSessions(week.sessions)
  return Object.fromEntries(
    Object.entries(derived)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([k, v]) => [k, v as number])
  )
}

export function calcOverloadInsights(
  currentWeek: WeekDoc,
  archivedWeeks: WeekDoc[],
): ExerciseInsight[] {
  const current = numericLifts(currentWeek)
  if (Object.keys(current).length === 0) return []

  const history: Record<string, number[]> = {}
  for (const week of archivedWeeks) {
    const lifts = numericLifts(week)
    for (const [ex, weight] of Object.entries(lifts)) {
      history[ex] = [...(history[ex] ?? []), weight]
    }
  }

  const insights: ExerciseInsight[] = []

  for (const [exercise, currentWeight] of Object.entries(current)) {
    const past = history[exercise] ?? []
    const allWeights = [...past, currentWeight]

    let weeksAtCurrent = 1
    for (let i = past.length - 1; i >= 0; i--) {
      if (past[i] === currentWeight) weeksAtCurrent++
      else break
    }

    const recent = allWeights.slice(-4)
    let weeklyVelocityPct: number | null = null
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const weeks = recent.length - 1
      weeklyVelocityPct = first > 0
        ? Math.round(((last - first) / first / weeks) * 1000) / 10
        : null
    }

    const allTimePeak = Math.max(...allWeights.slice(0, -1), 0)
    const isPr = past.length > 0 && currentWeight > allTimePeak

    let signal: OverloadSignal
    let suggestion: string

    if (isPr) {
      signal = 'pr'
      suggestion = `New PR at ${currentWeight}kg — log it and aim to repeat next week.`
    } else if (weeksAtCurrent >= 4) {
      signal = 'plateau'
      suggestion = `Stuck at ${currentWeight}kg for ${weeksAtCurrent} weeks. Try adding 2.5kg or change rep scheme.`
    } else if (weeksAtCurrent >= 3 && (weeklyVelocityPct === null || weeklyVelocityPct === 0)) {
      signal = 'progress'
      suggestion = `3 weeks at ${currentWeight}kg — ready to attempt ${Math.round((currentWeight + 2.5) * 2) / 2}kg.`
    } else {
      signal = 'ok'
      suggestion = `Progressing normally at ${currentWeight}kg.`
    }

    insights.push({ exercise, currentWeight, signal, weeklyVelocityPct, weeksAtCurrentWeight: weeksAtCurrent, suggestion })
  }

  const order: OverloadSignal[] = ['pr', 'plateau', 'progress', 'ok']
  return insights.sort((a, b) => order.indexOf(a.signal) - order.indexOf(b.signal))
}
