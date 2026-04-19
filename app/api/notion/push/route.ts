import { readCurrentWeek, readAppState, writeAppState } from '@/lib/data'
import { pushWeekToNotion } from '@/lib/notion'

// POST /api/notion/push
// Calls pushWeekToNotion with current week
// Updates state.notionLastSync on success
export async function POST() {
  const week = readCurrentWeek()
  if (!week) {
    return Response.json({ error: 'No active week' }, { status: 400 })
  }

  const result = await pushWeekToNotion(week)

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  // Update last sync timestamp
  const state = readAppState()
  writeAppState({ ...state, notionLastSync: new Date().toISOString() })

  return Response.json({ pushed: result.pushed })
}
