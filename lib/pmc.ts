import type { TrainingLoadPoint } from './training-load'
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns'

export interface PmcPoint {
  date: string
  ctl: number
  atl: number
  tsb: number
  load: number
  acwr: number | null
}

const CTL_TC = 42
const ATL_TC = 7
const CTL_FACTOR = 1 - Math.exp(-1 / CTL_TC)
const ATL_FACTOR = 1 - Math.exp(-1 / ATL_TC)

export function calcPmc(loadPoints: TrainingLoadPoint[], windowDays = 90): PmcPoint[] {
  if (loadPoints.length === 0) return []

  const dailyLoad = new Map<string, number>()
  for (const p of loadPoints) {
    dailyLoad.set(p.date, (dailyLoad.get(p.date) ?? 0) + p.training_load)
  }

  const sorted = [...loadPoints].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = parseISO(sorted[0].date)
  const lastDate = new Date()

  const days = eachDayOfInterval({ start: firstDate, end: lastDate })

  let ctl = 0
  let atl = 0
  const result: PmcPoint[] = []
  const cutoff = format(subDays(lastDate, windowDays), 'yyyy-MM-dd')

  // Sliding 7-day (acute) and 28-day (chronic) load sums, index-aligned to `days`.
  const loads = days.map((day) => dailyLoad.get(format(day, 'yyyy-MM-dd')) ?? 0)

  for (let i = 0; i < days.length; i++) {
    const dateStr = format(days[i], 'yyyy-MM-dd')
    const load = loads[i]

    ctl = ctl + CTL_FACTOR * (load - ctl)
    atl = atl + ATL_FACTOR * (load - atl)
    const tsb = ctl - atl

    let acwr: number | null = null
    if (i >= 27) {
      const acute = loads.slice(i - 6, i + 1).reduce((s, v) => s + v, 0)
      const chronic = loads.slice(i - 27, i + 1).reduce((s, v) => s + v, 0) / 4
      acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null
    }

    if (dateStr >= cutoff) {
      result.push({
        date: dateStr,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
        load,
        acwr,
      })
    }
  }

  return result
}
