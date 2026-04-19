import { readCurrentWeek, writeCurrentWeek, readAppState, writeAppState } from '@/lib/data'
import { pullWeekFromNotion } from '@/lib/notion'

// POST /api/notion/pull
// Calls pullWeekFromNotion with current week
// Writes updated sessions back to current-week.json
// Updates state.notionLastSync on success
export async function POST() {
  const week = readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 400 })
  }

  const result = await pullWeekFromNotion(week)

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  // Write updated sessions back
  writeCurrentWeek({ ...week, sessions: result.sessions })

  // Update last sync timestamp
  const state = readAppState()
  writeAppState({ ...state, notionLastSync: new Date().toISOString() })

  return Response.json({ pulled: result.pulled })
}
